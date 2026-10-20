// Copyright (c) 2026 Ada Technology. All rights reserved.
import { QueryClient } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { AppProviders } from './app/AppProviders.component.js';
import { createAppRoutes } from './app/createAppRoutes.js';
import { isProductionBuild, loadEnvironment, readMarketSymbols } from './environment.js';
import { USDT_BRL_PAIR } from './exchange/exchange.constant.js';
import { createApiClient } from './http/api-client.js';
import { createStreamConnector } from './live/stream-connector.js';
import { createSessionService } from './session/session-service.js';
import './styles/global.css';
import { applyStoredTheme } from './theme/theme-store.js';

const ROOT_ELEMENT_ID = 'root';
const SERVICE_WORKER_PATH = '/sw.js';
const QUERY_RETRY_COUNT = 1;

function registerServiceWorker(): void {
  if (!isProductionBuild() || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register(SERVICE_WORKER_PATH);
}

function start(): void {
  const container = document.getElementById(ROOT_ELEMENT_ID);
  if (container === null) throw new Error('Elemento #root não encontrado.');
  const environment = loadEnvironment();
  applyStoredTheme(window.localStorage, document.documentElement);
  const fetchImplementation = window.fetch.bind(window);
  const session = createSessionService({ fetchImplementation, now: () => Date.now() });
  const apiClient = createApiClient({ fetchImplementation, session });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: QUERY_RETRY_COUNT } },
  });
  const config = {
    authorizeUrl: environment.VITE_KEYCLOAK_AUTHORIZE_URL,
    clientId: environment.VITE_KEYCLOAK_CLIENT_ID,
    marketSymbols: readMarketSymbols(environment),
  };
  createRoot(container).render(
    <StrictMode>
      <AppProviders
        config={config}
        session={session}
        apiClient={apiClient}
        queryClient={queryClient}
        connectStream={createStreamConnector({
          apiClient,
          session,
          pairs: [...config.marketSymbols, USDT_BRL_PAIR],
        })}
      >
        <RouterProvider router={createBrowserRouter(createAppRoutes())} />
      </AppProviders>
    </StrictMode>,
  );
  registerServiceWorker();
}

start();
