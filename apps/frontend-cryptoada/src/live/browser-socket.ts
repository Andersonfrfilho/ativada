// Copyright (c) 2026 Ada Technology. All rights reserved.
import { STREAM_PATH, TICKET_PARAMETER } from './stream.constant.js';
import type { SocketLike } from './stream-client.js';

const SECURE_PROTOCOL = 'https:';

// Mesma origem do painel (o proxy leva `/v1/stream` à API): o navegador manda o Origin certo sozinho.
export function openBrowserSocket(ticket: string): SocketLike {
  const protocol = window.location.protocol === SECURE_PROTOCOL ? 'wss:' : 'ws:';
  const query = new URLSearchParams({ [TICKET_PARAMETER]: ticket });
  const socket = new WebSocket(
    `${protocol}//${window.location.host}${STREAM_PATH}?${query.toString()}`,
  );
  return {
    send: (data) => socket.send(data),
    close: (code) => socket.close(code),
    listen: (handlers): void => {
      socket.addEventListener('open', () => handlers.open());
      socket.addEventListener('message', (event) => handlers.message(event.data));
      socket.addEventListener('close', (event) => handlers.close(event.code));
    },
  };
}
