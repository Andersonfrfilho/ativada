// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';

export const STREAM_TICKET_DOCUMENTATION: RouteDocumentation = {
  summary: 'Ticket de uso único (30 s) para o handshake do WebSocket de tempo real.',
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
