// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';

export const STREAM_TICKET_DOCUMENTATION: RouteDocumentation = {
  summary:
    'Ticket de uso único (30 s) para o handshake do WebSocket `GET /v1/stream?ticket=…` (Origin da lista; fecha com 4401 quando o token vence, a menos que o painel mande `{ type: "renew", ticket }` com um ticket novo, e com 4403 quando a conta é bloqueada ou apagada).',
  tag: 'Tempo real',
  successes: [
    {
      status: HTTP_STATUS.CREATED,
      description: 'O ticket e a validade.',
      schema: z.strictObject({ ticket: z.string(), expiresInSeconds: z.number().positive() }),
    },
  ],
  errors: [],
};
