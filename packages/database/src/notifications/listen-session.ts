// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  SESSION_PHASE,
  type ListenSession,
  type ListenSessionParams,
  type SessionContext,
} from './listen-session.types.js';
import { handleAuthentication } from './listen-session-auth.js';
import { endSession, isEnded } from './listen-session-end.js';
import { handleSslAnswer, sendStartup } from './listen-session-startup.js';
import { BACKEND_MESSAGE } from './postgres-wire.constant.js';
import { SSL_MODE } from './parse-connection-url.js';
import {
  createFrameReader,
  decodeAuthentication,
  decodeErrorSqlState,
  decodeNotification,
  type WireFrame,
} from './postgres-wire-decode.js';
import { encodeQuery, encodeSslRequest } from './postgres-wire-encode.js';
import { SESSION_END_REASON } from './session-end.js';

const AUTH_FAILURE_SQLSTATE_CLASS = '28';
const AUTH_PHASES: readonly string[] = [SESSION_PHASE.STARTUP, SESSION_PHASE.AUTHENTICATING];

function handleServerError(ctx: SessionContext, body: Uint8Array): void {
  const sqlState = decodeErrorSqlState(body);
  const isAuthFailure =
    AUTH_PHASES.includes(ctx.phase) && sqlState?.startsWith(AUTH_FAILURE_SQLSTATE_CLASS) === true;
  endSession(
    ctx,
    isAuthFailure ? SESSION_END_REASON.AUTHENTICATION_FAILED : SESSION_END_REASON.SERVER_ERROR,
    sqlState,
  );
}

function handleReadyForQuery(ctx: SessionContext): void {
  if (ctx.phase === SESSION_PHASE.AWAITING_READY) {
    ctx.transport?.write(encodeQuery(`LISTEN "${ctx.params.channel}"`));
    ctx.phase = SESSION_PHASE.SUBSCRIBING;
  } else if (ctx.phase === SESSION_PHASE.LISTENING) {
    ctx.isPingPending = false;
  }
}

function handleCommandComplete(ctx: SessionContext): void {
  if (ctx.phase !== SESSION_PHASE.SUBSCRIBING) return;
  ctx.phase = SESSION_PHASE.LISTENING;
  ctx.wasListening = true;
  ctx.params.handlers.onListening();
}

function handleNotification(ctx: SessionContext, body: Uint8Array): void {
  if (ctx.phase !== SESSION_PHASE.LISTENING) return;
  const notification = decodeNotification(body);
  if (notification.channel === ctx.params.channel) {
    ctx.params.handlers.onNotification(notification.payload);
  }
}

function handleFrame(ctx: SessionContext, frame: WireFrame): void {
  if (frame.type === BACKEND_MESSAGE.AUTHENTICATION) {
    handleAuthentication(ctx, decodeAuthentication(frame.body), {
      end: (reason, sqlState) => endSession(ctx, reason, sqlState),
    });
  } else if (frame.type === BACKEND_MESSAGE.ERROR) handleServerError(ctx, frame.body);
  else if (frame.type === BACKEND_MESSAGE.READY_FOR_QUERY) handleReadyForQuery(ctx);
  else if (frame.type === BACKEND_MESSAGE.COMMAND_COMPLETE) handleCommandComplete(ctx);
  else if (frame.type === BACKEND_MESSAGE.EMPTY_QUERY) ctx.isPingPending = false;
  else if (frame.type === BACKEND_MESSAGE.NOTIFICATION) handleNotification(ctx, frame.body);
}

function handleChunk(ctx: SessionContext, chunk: Uint8Array): void {
  if (isEnded(ctx)) return;
  if (ctx.phase === SESSION_PHASE.SSL) {
    handleSslAnswer(ctx, chunk[0]);
    return;
  }
  try {
    for (const frame of ctx.reader.push(chunk)) {
      if (isEnded(ctx)) return;
      handleFrame(ctx, frame);
    }
  } catch {
    endSession(ctx, SESSION_END_REASON.PROTOCOL_ERROR);
  }
}

function handleClose(ctx: SessionContext): void {
  const wasConnecting = ctx.phase === SESSION_PHASE.CONNECTING;
  endSession(
    ctx,
    wasConnecting ? SESSION_END_REASON.CONNECTION_FAILED : SESSION_END_REASON.CLOSED_BY_SERVER,
  );
}

async function connect(ctx: SessionContext): Promise<void> {
  const { settings, openTransport } = ctx.params;
  try {
    ctx.transport = await openTransport({
      host: settings.host,
      port: settings.port,
      events: {
        onData: (chunk) => handleChunk(ctx, chunk),
        onClose: () => handleClose(ctx),
      },
    });
  } catch {
    endSession(ctx, SESSION_END_REASON.CONNECTION_FAILED);
    return;
  }
  if (isEnded(ctx)) {
    ctx.transport.close();
    return;
  }
  if (settings.sslMode === SSL_MODE.DISABLE) {
    sendStartup(ctx);
    return;
  }
  ctx.phase = SESSION_PHASE.SSL;
  ctx.transport.write(encodeSslRequest());
}

function checkAlive(ctx: SessionContext): boolean {
  if (isEnded(ctx)) return true;
  if (ctx.phase !== SESSION_PHASE.LISTENING) {
    const isStalled = ctx.lastCheckedPhase === ctx.phase;
    ctx.lastCheckedPhase = ctx.phase;
    return !isStalled;
  }
  if (ctx.isPingPending) return false;
  ctx.isPingPending = true;
  ctx.transport?.write(encodeQuery(''));
  return true;
}

// Uma conexão, do soquete ao LISTEN confirmado. Não reconecta: quem decide o que fazer com o fim é `onEnded`.
export function startListenSession(params: ListenSessionParams): ListenSession {
  const ctx: SessionContext = {
    params,
    reader: createFrameReader(),
    phase: SESSION_PHASE.CONNECTING,
    transport: undefined,
    scram: undefined,
    channelBindingHash: undefined,
    isServerVerified: false,
    wasListening: false,
    isPingPending: false,
    lastCheckedPhase: undefined,
  };
  void connect(ctx);
  return {
    checkAlive: () => checkAlive(ctx),
    stop: (reason = SESSION_END_REASON.STOPPED) => endSession(ctx, reason),
  };
}
