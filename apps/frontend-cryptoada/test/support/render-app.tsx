// Copyright (c) 2026 Ada Technology. All rights reserved.
import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { HTTP_STATUS } from '@cryptoada/environment';

import { AppProviders } from '../../src/app/AppProviders.component.js';
import { createAppRoutes } from '../../src/app/createAppRoutes.js';
import type { StreamConnector, StreamHandlers } from '../../src/live/stream-connector.js';
import type { MarketTick, StreamMessage, StreamStatus } from '../../src/live/stream-client.js';
import { createApiClient } from '../../src/http/api-client.js';
import { createSessionService, type SessionService } from '../../src/session/session-service.js';
import {
  createFakeAccessToken,
  createFakeFetch,
  dataResponse,
  errorResponse,
  type FakeFetch,
  type FakeRoute,
} from './fake-fetch.js';

export const TEST_EMAIL = 'pessoa@example.com';

export type RenderAppOptions = {
  readonly path: string;
  readonly isAuthenticated: boolean;
  readonly routes?: readonly FakeRoute[];
  // Quando as rotas do teste já trazem a renovação da sessão, a padrão não é registrada.
  readonly ownsSessionRoute?: boolean;
};

export type FakeStream = {
  readonly emit: (message: StreamMessage) => void;
  readonly tick: (tick: MarketTick) => void;
  readonly setStatus: (status: StreamStatus) => void;
  readonly resync: (reason?: string) => void;
  readonly connections: () => number;
  readonly stops: () => number;
};

export type RenderedApp = {
  readonly stream: FakeStream;
  readonly fake: FakeFetch;
  readonly session: SessionService;
  readonly router: ReturnType<typeof createMemoryRouter>;
};

function buildSessionRoute(isAuthenticated: boolean): FakeRoute {
  return {
    method: 'POST',
    path: '/v1/session/refresh',
    respond: () =>
      isAuthenticated
        ? dataResponse({
            accessToken: createFakeAccessToken({ email: TEST_EMAIL }),
            expiresIn: 300,
          })
        : errorResponse(HTTP_STATUS.UNAUTHORIZED, 'SESSION_INVALID'),
  };
}

function createFakeStream(): { readonly stream: FakeStream; readonly connect: StreamConnector } {
  let current: StreamHandlers | undefined;
  let connections = 0;
  let stops = 0;
  return {
    connect: (handlers): { readonly stop: () => void } => {
      current = handlers;
      connections += 1;
      return { stop: () => void (stops += 1) };
    },
    stream: {
      emit: (message) => current?.onMessage(message),
      tick: (tick) => current?.onTick(tick),
      setStatus: (status) => current?.onStatus(status),
      resync: (reason = 'listener_lost') => current?.onResync(reason),
      connections: () => connections,
      stops: () => stops,
    },
  };
}

export function renderApp(options: RenderAppOptions): RenderedApp {
  const sessionRoutes =
    options.ownsSessionRoute === true ? [] : [buildSessionRoute(options.isAuthenticated)];
  const fake = createFakeFetch([...sessionRoutes, ...(options.routes ?? [])]);
  const session = createSessionService({ fetchImplementation: fake.fetch, now: () => Date.now() });
  const apiClient = createApiClient({ fetchImplementation: fake.fetch, session });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const config = {
    authorizeUrl: 'http://127.0.0.1:56181/realms/cryptoada/protocol/openid-connect/auth',
    clientId: 'cryptoada-session',
    marketSymbols: ['BTCUSDT', 'ETHUSDT'],
    runPollMilliseconds: 20,
    fallbackPollMilliseconds: 20,
  };
  const { stream, connect } = createFakeStream();
  const router = createMemoryRouter(createAppRoutes(), { initialEntries: [options.path] });
  render(
    <AppProviders
      config={config}
      session={session}
      apiClient={apiClient}
      queryClient={queryClient}
      connectStream={connect}
    >
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { fake, session, router, stream };
}
