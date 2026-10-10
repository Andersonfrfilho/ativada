// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { Route } from '../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import { STREAM_TICKETS_PATH } from './stream-ticket.constant.js';
import { STREAM_TICKET_DOCUMENTATION } from './stream-ticket.docs.js';
import type { StreamTicketStore } from './stream-ticket-store.js';

export function createStreamTicketRoutes(ticketStore: StreamTicketStore): readonly Route[] {
  return [
    {
      method: HTTP_METHOD.POST,
      path: STREAM_TICKETS_PATH,
      access: ROUTE_ACCESS.USER,
      rateLimitPolicy: RATE_LIMIT_POLICY.STREAM_TICKET_CLIENT_ADDRESS,
      documentation: STREAM_TICKET_DOCUMENTATION,
      handler: ({ authenticatedUser, accessTokenExpiresAtMilliseconds }) =>
        Promise.resolve({
          status: HTTP_STATUS.CREATED,
          data: ticketStore.issueTicket({
            userId: authenticatedUser.userId,
            keycloakSubject: authenticatedUser.keycloakSubject,
            sessionExpiresAtMilliseconds: accessTokenExpiresAtMilliseconds,
          }),
        }),
    },
  ];
}
