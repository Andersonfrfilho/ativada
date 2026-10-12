// Copyright (c) 2026 Ada Technology. All rights reserved.
import { closeSocketSafely, deliverToSocket } from './socket-delivery.js';
import type { StreamSocket } from './stream-socket.types.js';

export type AddSocketResult = 'added' | 'limit-reached';

export type StreamHub = {
  readonly add: (socket: StreamSocket) => AddSocketResult;
  readonly remove: (socket: StreamSocket) => void;
  readonly countForUser: (userId: string) => number;
  readonly size: () => number;
  readonly allSockets: () => readonly StreamSocket[];
  // Entrega só aos sockets daquele dono: o dono nunca vem do payload do aviso, vem do banco (ADR 0001 §e).
  readonly sendToUser: (userId: string, message: object) => number;
  // Só para mensagens de controle (`resync`), que não levam dado de ninguém.
  readonly broadcast: (message: object) => number;
  readonly closeUser: (userId: string, code: number, reason: string) => number;
  readonly closeAll: (code: number, reason: string) => void;
};

export type StreamHubOptions = { readonly maxSocketsPerUser: number };

export function createStreamHub(options: StreamHubOptions): StreamHub {
  const socketsByUser = new Map<string, Set<StreamSocket>>();

  function allSockets(): readonly StreamSocket[] {
    return [...socketsByUser.values()].flatMap((sockets) => [...sockets]);
  }

  // Um soquete que falha ao enviar não derruba a entrega aos outros; ele sai sozinho pelo `close` do servidor.
  function sendToAll(sockets: Iterable<StreamSocket>, message: object): number {
    const text = JSON.stringify(message);
    let delivered = 0;
    for (const socket of sockets) if (deliverToSocket(socket, text)) delivered += 1;
    return delivered;
  }

  return {
    add: (socket): AddSocketResult => {
      const sockets = socketsByUser.get(socket.data.userId) ?? new Set<StreamSocket>();
      if (!sockets.has(socket) && sockets.size >= options.maxSocketsPerUser) return 'limit-reached';
      sockets.add(socket);
      socketsByUser.set(socket.data.userId, sockets);
      return 'added';
    },
    remove: (socket): void => {
      const sockets = socketsByUser.get(socket.data.userId);
      sockets?.delete(socket);
      if (sockets?.size === 0) socketsByUser.delete(socket.data.userId);
    },
    countForUser: (userId): number => socketsByUser.get(userId)?.size ?? 0,
    size: (): number => allSockets().length,
    allSockets,
    sendToUser: (userId, message): number => sendToAll(socketsByUser.get(userId) ?? [], message),
    broadcast: (message): number => sendToAll(allSockets(), message),
    closeUser: (userId, code, reason): number => {
      const sockets = [...(socketsByUser.get(userId) ?? [])];
      for (const socket of sockets) closeSocketSafely(socket, code, reason);
      return sockets.length;
    },
    closeAll: (code, reason): void => {
      for (const socket of allSockets()) closeSocketSafely(socket, code, reason);
    },
  };
}
