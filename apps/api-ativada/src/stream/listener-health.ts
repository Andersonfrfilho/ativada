// Copyright (c) 2026 Ada Technology. All rights reserved.
import { isFatalSessionEnd, type NotificationListener, type SessionEnd } from '@ativada/database';

import type { Logger } from '../logging/logger.js';
import { STREAM_LOG_MESSAGE } from './stream.constant.js';

export const LISTENER_STATE = {
  UP: 'up',
  RECONNECTING: 'reconnecting',
  FAILED: 'failed',
} as const;

export type ListenerState = (typeof LISTENER_STATE)[keyof typeof LISTENER_STATE];

// Só o estado e o código do motivo: nada de URL, usuário, senha nem texto do servidor.
export type ListenerHealth = {
  readonly state: ListenerState;
  readonly reason: string | null;
};

export function toListenerHealth(
  listener: Pick<NotificationListener, 'isListening' | 'fatalReason'> | undefined,
): ListenerHealth {
  if (listener === undefined) return { state: LISTENER_STATE.RECONNECTING, reason: null };
  const reason = listener.fatalReason();
  if (reason !== undefined) return { state: LISTENER_STATE.FAILED, reason };
  const state = listener.isListening() ? LISTENER_STATE.UP : LISTENER_STATE.RECONNECTING;
  return { state, reason: null };
}

// Queda de rede é aviso; senha errada, autenticação não suportada ou TLS indisponível pedem alguém: erro.
export function logListenerLoss(logger: Logger, end: SessionEnd): void {
  const write = isFatalSessionEnd(end) ? logger.error : logger.warn;
  write(STREAM_LOG_MESSAGE, { event: 'stream.listener.lost', ...end });
}
