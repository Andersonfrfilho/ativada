// Copyright (c) 2026 Ada Technology. All rights reserved.
import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { HTTP_STATUS } from '@cryptoada/environment';

import { AppProviders } from '../../src/app/AppProviders.component.js';
import { createAppRoutes } from '../../src/app/createAppRoutes.js';
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

export type RenderedApp = {
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
  };
  const router = createMemoryRouter(createAppRoutes(), { initialEntries: [options.path] });
  render(
    <AppProviders config={config} session={session} apiClient={apiClient} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { fake, session, router };
}
