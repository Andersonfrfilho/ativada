// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  CLOSE_REASON,
  RESYNC_REASON,
  SERVER_MESSAGE_TYPE,
  WEBSOCKET_CLOSE_CODE,
} from './stream.constant.js';
import type { StreamSocket } from './stream-socket.types.js';

const SEND_OUTCOME = { ACCEPTED: 'accepted', DROPPED: 'dropped', FAILED: 'failed' } as const;
type SendOutcome = (typeof SEND_OUTCOME)[keyof typeof SEND_OUTCOME];

const RESYNC_TEXT = JSON.stringify({
  type: SERVER_MESSAGE_TYPE.RESYNC,
  reason: RESYNC_REASON.BACKPRESSURE,
});

// O `send` do Bun devolve os bytes enviados, -1 (aceito, mas na fila com pressão) ou 0 (descartado); lançar é socket já fechado.
function sendRaw(socket: StreamSocket, text: string): SendOutcome {
  try {
    const result = socket.send(text);
    return result === 0 ? SEND_OUTCOME.DROPPED : SEND_OUTCOME.ACCEPTED;
  } catch {
    return SEND_OUTCOME.FAILED;
  }
}

export function closeSocketSafely(socket: StreamSocket, code: number, reason: string): void {
  try {
    socket.close(code, reason);
  } catch {
    // Já fechado: nada a encerrar.
  }
}

// Cliente que perdeu uma mensagem fica sabendo (`resync` manda refazer a leitura); se nem o aviso cabe, a conexão cai com
// 1013 e o cliente reconecta em vez de seguir com o fluxo furado.
function recoverFromDrop(socket: StreamSocket): void {
  if (sendRaw(socket, RESYNC_TEXT) === SEND_OUTCOME.ACCEPTED) return;
  closeSocketSafely(socket, WEBSOCKET_CLOSE_CODE.TRY_AGAIN_LATER, CLOSE_REASON.SLOW_CLIENT);
}

// Uma entrega que nunca lança: um socket que falha não derruba a entrega aos outros nem sobe como erro não tipado.
// Devolve se a mensagem foi aceita pelo socket.
export function deliverToSocket(socket: StreamSocket, text: string): boolean {
  const outcome = sendRaw(socket, text);
  if (outcome === SEND_OUTCOME.DROPPED) recoverFromDrop(socket);
  return outcome === SEND_OUTCOME.ACCEPTED;
}
