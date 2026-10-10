// Copyright (c) 2026 Ada Technology. All rights reserved.
import { SESSION_PHASE, type SessionContext } from './listen-session.types.js';
import { encodeTerminate } from './postgres-wire-encode.js';
import { SESSION_END_REASON, type SessionEndReason } from './session-end.js';

export function isEnded(ctx: SessionContext): boolean {
  return ctx.phase === SESSION_PHASE.ENDED;
}

export function endSession(ctx: SessionContext, reason: SessionEndReason, sqlState?: string): void {
  if (isEnded(ctx)) return;
  ctx.phase = SESSION_PHASE.ENDED;
  if (reason === SESSION_END_REASON.STOPPED) ctx.transport?.write(encodeTerminate());
  ctx.transport?.close();
  ctx.params.handlers.onEnded({ reason, sqlState, wasListening: ctx.wasListening });
}
