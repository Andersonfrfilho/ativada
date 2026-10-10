// Copyright (c) 2026 Ada Technology. All rights reserved.
import { endSession, isEnded } from './listen-session-end.js';
import { SESSION_PHASE, type SessionContext } from './listen-session.types.js';
import { SSL_MODE } from './parse-connection-url.js';
import { SSL_ACCEPTED_BYTE, SSL_REFUSED_BYTE } from './postgres-wire.constant.js';
import { encodeStartup } from './postgres-wire-encode.js';
import { SESSION_END_REASON } from './session-end.js';

const APPLICATION_NAME = 'cryptoada-listener';

export function sendStartup(ctx: SessionContext): void {
  if (isEnded(ctx)) return;
  const { settings } = ctx.params;
  ctx.phase = SESSION_PHASE.STARTUP;
  ctx.transport?.write(
    encodeStartup({
      user: settings.user,
      database: settings.database,
      applicationName: APPLICATION_NAME,
    }),
  );
}

export function handleSslAnswer(ctx: SessionContext, answer: number | undefined): void {
  const { sslMode, host } = ctx.params.settings;
  if (answer === SSL_ACCEPTED_BYTE) {
    ctx.phase = SESSION_PHASE.TLS;
    const upgrade = ctx.transport?.upgradeToTls({
      shouldVerify: sslMode === SSL_MODE.VERIFY,
      serverName: host,
    });
    upgrade?.then(
      () => {
        if (ctx.phase === SESSION_PHASE.TLS) sendStartup(ctx);
      },
      () => endSession(ctx, SESSION_END_REASON.TLS_FAILED),
    );
  } else if (answer === SSL_REFUSED_BYTE && sslMode === SSL_MODE.PREFER) {
    sendStartup(ctx);
  } else if (answer === SSL_REFUSED_BYTE) {
    endSession(ctx, SESSION_END_REASON.TLS_UNAVAILABLE);
  } else {
    endSession(ctx, SESSION_END_REASON.PROTOCOL_ERROR);
  }
}
