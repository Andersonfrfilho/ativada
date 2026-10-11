// Copyright (c) 2026 Ada Technology. All rights reserved.
import { USER_RESOLUTION_STATUS, type UserResolution } from '@cryptoada/database';

import {
  MARKET_CLIENT_MESSAGE_TYPE,
  MARKET_ERROR_CODE,
} from '../market-stream/market-stream.constant.js';
import { MarketSubscriptionError } from '../market-stream/market-stream.error.js';
import type { MarketSubscriptions } from '../market-stream/create-market-publisher.js';
import {
  CLIENT_MESSAGE_TYPE,
  CLOSE_REASON,
  MESSAGE_ERROR_CODE,
  MESSAGE_WINDOW_MILLISECONDS,
  SERVER_MESSAGE_TYPE,
  WEBSOCKET_CLOSE_CODE,
} from './stream.constant.js';
import { deliverToSocket } from './socket-delivery.js';
import { parseClientMessage } from './stream-client-message.schema.js';
import type { StreamSocket } from './stream-socket.types.js';
import type { StreamTicketStore } from './stream-ticket-store.js';

export type MessageDependencies = {
  readonly ticketStore: StreamTicketStore;
  readonly resolveUser: (subject: string) => Promise<UserResolution>;
  readonly now: () => number;
  readonly maxMessagesPerMinute: number;
  readonly reportUnexpectedError: (error: unknown) => void;
  // O ticker público (T4.7); ausente = o tempo real de mercado está desligado neste ambiente.
  readonly market?: MarketSubscriptions | undefined;
};

function sendMessageError(socket: StreamSocket): void {
  deliverToSocket(
    socket,
    JSON.stringify({ type: SERVER_MESSAGE_TYPE.ERROR, code: MESSAGE_ERROR_CODE.INVALID_MESSAGE }),
  );
}

function sendMarketError(socket: StreamSocket, code: string, pair?: string): void {
  const detail = pair === undefined ? {} : { pair };
  deliverToSocket(socket, JSON.stringify({ type: SERVER_MESSAGE_TYPE.ERROR, code, ...detail }));
}

// Assinar ou cancelar pares do ticker público: a recusa é um erro TIPADO (`code` fixo), nunca um fechamento do socket.
function handleMarketMessage(
  socket: StreamSocket,
  message: { readonly type: string; readonly pairs: readonly string[] },
  market: MarketSubscriptions | undefined,
): void {
  if (market === undefined) {
    sendMarketError(socket, MARKET_ERROR_CODE.MARKET_UNAVAILABLE);
    return;
  }
  try {
    if (message.type === MARKET_CLIENT_MESSAGE_TYPE.SUBSCRIBE)
      market.subscribe(socket, message.pairs);
    else market.unsubscribe(socket, message.pairs);
  } catch (error: unknown) {
    if (!(error instanceof MarketSubscriptionError)) throw error;
    sendMarketError(socket, error.code, error.pair);
  }
}

// Janela de um minuto por socket: o painel não manda mensagem a toda hora, então o excesso é abuso.
export function isOverMessageLimit(
  socket: StreamSocket,
  dependencies: MessageDependencies,
): boolean {
  const { data } = socket;
  const nowMilliseconds = dependencies.now();
  if (nowMilliseconds - data.messageWindowStartMilliseconds >= MESSAGE_WINDOW_MILLISECONDS) {
    data.messageWindowStartMilliseconds = nowMilliseconds;
    data.messageCount = 0;
  }
  data.messageCount += 1;
  return data.messageCount > dependencies.maxMessagesPerMinute;
}

// Renovação dentro do socket (ADR 0001 §e): um ticket NOVO, de uso único, do MESMO usuário. Ticket de outro usuário,
// desconhecido, reutilizado ou vencido fecha com 4401; conta bloqueada ou apagada nesse meio-tempo, com 4403.
async function renew(
  socket: StreamSocket,
  ticket: string,
  dependencies: MessageDependencies,
): Promise<void> {
  const claims = dependencies.ticketStore.consumeTicket(ticket);
  const isValid =
    claims !== undefined &&
    claims.userId === socket.data.userId &&
    claims.sessionExpiresAtMilliseconds > dependencies.now();
  if (!isValid) {
    socket.close(WEBSOCKET_CLOSE_CODE.TOKEN_EXPIRED, CLOSE_REASON.INVALID_TICKET);
    return;
  }
  const resolution = await dependencies.resolveUser(claims.keycloakSubject);
  if (resolution.status !== USER_RESOLUTION_STATUS.ACTIVE) {
    socket.close(WEBSOCKET_CLOSE_CODE.ACCOUNT_BLOCKED, CLOSE_REASON.ACCOUNT_INACTIVE);
    return;
  }
  if (resolution.userId !== socket.data.userId) {
    socket.close(WEBSOCKET_CLOSE_CODE.TOKEN_EXPIRED, CLOSE_REASON.INVALID_TICKET);
    return;
  }
  socket.data.expiresAtMilliseconds = claims.sessionExpiresAtMilliseconds;
  deliverToSocket(
    socket,
    JSON.stringify({
      type: SERVER_MESSAGE_TYPE.RENEWED,
      expiresAt: claims.sessionExpiresAtMilliseconds,
    }),
  );
}

export function handleStreamMessage(
  socket: StreamSocket,
  message: string | Uint8Array,
  dependencies: MessageDependencies,
): void {
  socket.data.lastActivityAtMilliseconds = dependencies.now();
  if (isOverMessageLimit(socket, dependencies)) {
    socket.close(WEBSOCKET_CLOSE_CODE.POLICY_VIOLATION, CLOSE_REASON.MESSAGE_FLOOD);
    return;
  }
  const parsed = typeof message === 'string' ? parseClientMessage(message) : undefined;
  if (parsed === undefined) {
    sendMessageError(socket);
    return;
  }
  if (parsed.type === CLIENT_MESSAGE_TYPE.RENEW) {
    renew(socket, parsed.ticket, dependencies).catch((error: unknown) => {
      dependencies.reportUnexpectedError(error);
      socket.close(WEBSOCKET_CLOSE_CODE.TRY_AGAIN_LATER, CLOSE_REASON.UNAVAILABLE);
    });
    return;
  }
  handleMarketMessage(socket, parsed, dependencies.market);
}
