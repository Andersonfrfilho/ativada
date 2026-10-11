// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_STATUS } from '@cryptoada/environment';

import { ApiError } from '../http/api.error.js';
import {
  BASE_RECONNECT_MILLISECONDS,
  CLOSE_CODE,
  FIRST_RENEWAL_MILLISECONDS,
  MAX_RECONNECT_MILLISECONDS,
  MIN_RENEWAL_MILLISECONDS,
  RENEWAL_LEAD_MILLISECONDS,
  RESYNC_REASON_RECONNECTED,
  STREAM_STATUS,
  type StreamStatus,
} from './stream.constant.js';
import { parseServerMessage, type ServerMessage } from './stream.validation.js';

export type { StreamStatus } from './stream.constant.js';

export type StreamMessage = Extract<ServerMessage, { type: 'event' | 'price_alert' }>;

export type SocketHandlers = {
  readonly open: () => void;
  readonly message: (data: unknown) => void;
  readonly close: (code: number) => void;
};

export type SocketLike = {
  readonly send: (data: string) => void;
  readonly close: (code: number) => void;
  readonly listen: (handlers: SocketHandlers) => void;
};

export type StreamClientOptions = {
  readonly requestTicket: () => Promise<string>;
  readonly refreshSession: () => Promise<unknown>;
  readonly openSocket: (ticket: string) => SocketLike;
  readonly onStatus: (status: StreamStatus) => void;
  readonly onMessage: (message: StreamMessage) => void;
  readonly onResync: (reason: string) => void;
  readonly schedule: (run: () => void, delayMilliseconds: number) => () => void;
  readonly now: () => number;
  readonly random: () => number;
};

export type StreamClient = { readonly start: () => void; readonly stop: () => void };

// O socket do painel: ticket de uso único, renovação dentro do socket antes de o token vencer, reconexão com espera
// crescente e `resync` (o painel rebusca por REST: nada do que passou enquanto caiu fica errado).
class ReconnectingStream implements StreamClient {
  private socket: SocketLike | undefined;
  private cancelTimer: (() => void) | undefined;
  private attempts = 0;
  private hasConnectedBefore = false;
  private isStopped = false;

  constructor(private readonly options: StreamClientOptions) {}

  readonly start = (): void => {
    this.options.onStatus(STREAM_STATUS.CONNECTING);
    void this.connect();
  };

  readonly stop = (): void => {
    this.isStopped = true;
    this.clearTimer();
    this.socket?.close(CLOSE_CODE.NORMAL);
    this.options.onStatus(STREAM_STATUS.STOPPED);
  };

  private async connect(): Promise<void> {
    try {
      const ticket = await this.options.requestTicket();
      if (this.isStopped) return;
      const socket = this.options.openSocket(ticket);
      this.socket = socket;
      socket.listen({
        open: () => this.handleOpen(),
        message: (data) => this.handleMessage(data),
        close: (code) => this.handleClose(socket, code),
      });
    } catch (error: unknown) {
      if (this.isStopped) return;
      const isSessionOver = error instanceof ApiError && error.status === HTTP_STATUS.UNAUTHORIZED;
      if (isSessionOver) this.stop();
      else this.scheduleReconnect(this.nextWait());
    }
  }

  private handleOpen(): void {
    this.attempts = 0;
    this.options.onStatus(STREAM_STATUS.LIVE);
    if (this.hasConnectedBefore) this.options.onResync(RESYNC_REASON_RECONNECTED);
    this.hasConnectedBefore = true;
    this.scheduleRenewal(FIRST_RENEWAL_MILLISECONDS);
  }

  private handleMessage(data: unknown): void {
    const message = parseServerMessage(data);
    if (message === undefined) return;
    if (message.type === 'resync') this.options.onResync(message.reason);
    else if (message.type === 'renewed') this.scheduleNextRenewal(message.expiresAt);
    else this.options.onMessage(message);
  }

  private handleClose(closed: SocketLike, code: number): void {
    if (this.isStopped || closed !== this.socket) return;
    this.clearTimer();
    if (code === CLOSE_CODE.ACCOUNT_BLOCKED) {
      this.options.onStatus(STREAM_STATUS.BLOCKED);
      return;
    }
    this.options.onStatus(STREAM_STATUS.RECONNECTING);
    this.scheduleReconnect(code === CLOSE_CODE.TOKEN_EXPIRED ? 0 : this.nextWait());
  }

  private nextWait(): number {
    const ceiling = Math.min(
      MAX_RECONNECT_MILLISECONDS,
      BASE_RECONNECT_MILLISECONDS * 2 ** this.attempts,
    );
    this.attempts += 1;
    return Math.round(ceiling * (0.5 + this.options.random() / 2));
  }

  private scheduleReconnect(waitMilliseconds: number): void {
    this.options.onStatus(STREAM_STATUS.RECONNECTING);
    this.cancelTimer = this.options.schedule(() => void this.connect(), waitMilliseconds);
  }

  private scheduleNextRenewal(sessionExpiresAt: number): void {
    const wait = sessionExpiresAt - this.options.now() - RENEWAL_LEAD_MILLISECONDS;
    this.scheduleRenewal(Math.max(MIN_RENEWAL_MILLISECONDS, wait));
  }

  private scheduleRenewal(waitMilliseconds: number): void {
    this.clearTimer();
    this.cancelTimer = this.options.schedule(() => void this.renew(), waitMilliseconds);
  }

  // Sessão renovada ANTES do ticket: o ticket novo carrega o vencimento do token novo.
  private async renew(): Promise<void> {
    const socket = this.socket;
    try {
      await this.options.refreshSession();
      const ticket = await this.options.requestTicket();
      socket?.send(JSON.stringify({ type: 'renew', ticket }));
    } catch {
      socket?.close(CLOSE_CODE.RENEWAL_FAILED);
    }
  }

  private clearTimer(): void {
    this.cancelTimer?.();
    this.cancelTimer = undefined;
  }
}

export function createStreamClient(options: StreamClientOptions): StreamClient {
  return new ReconnectingStream(options);
}
