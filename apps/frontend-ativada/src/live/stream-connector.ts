// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_METHOD } from '@ativada/environment';

import { API_PATH } from '../app/app.constant.js';
import type { ApiClient } from '../http/api-client.js';
import type { SessionService } from '../session/session-service.js';
import { openBrowserSocket } from './browser-socket.js';
import {
  createStreamClient,
  type MarketTick,
  type StreamClientOptions,
  type StreamMessage,
  type StreamStatus,
} from './stream-client.js';
import { ticketResponseSchema, type StreamCandle } from './stream.validation.js';

export type StreamHandlers = {
  readonly onStatus: (status: StreamStatus) => void;
  readonly onMessage: (message: StreamMessage) => void;
  readonly onTick: (tick: MarketTick) => void;
  readonly onCandle?: (candle: StreamCandle) => void;
  readonly onResync: (reason: string) => void;
};

export type StreamConnection = { readonly stop: () => void };

export type StreamConnector = (handlers: StreamHandlers) => StreamConnection;

export type StreamConnectorDependencies = {
  readonly apiClient: ApiClient;
  readonly session: SessionService;
  readonly pairs: readonly string[];
};

function scheduleInBrowser(run: () => void, delayMilliseconds: number): () => void {
  const timer = window.setTimeout(run, delayMilliseconds);
  return () => window.clearTimeout(timer);
}

export function createStreamConnector(dependencies: StreamConnectorDependencies): StreamConnector {
  const requestTicket: StreamClientOptions['requestTicket'] = async () => {
    const issued = await dependencies.apiClient.request({
      method: HTTP_METHOD.POST,
      path: API_PATH.STREAM_TICKETS,
      schema: ticketResponseSchema,
    });
    return issued.ticket;
  };
  return (handlers) => {
    const client = createStreamClient({
      ...handlers,
      pairs: dependencies.pairs,
      requestTicket,
      refreshSession: () => dependencies.session.renew(),
      openSocket: openBrowserSocket,
      schedule: scheduleInBrowser,
      now: () => Date.now(),
      random: () => Math.random(),
    });
    client.start();
    return { stop: client.stop };
  };
}
