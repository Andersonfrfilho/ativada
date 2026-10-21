// Copyright (c) 2026 Ada Technology. All rights reserved.
import { QueryClient } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { AppProviders } from './app/AppProviders.component.js';
import type { AppConfig } from './app/app-context.js';
import { createAppRoutes } from './app/createAppRoutes.js';
import {
  isProductionBuild,
  loadEnvironment,
  readMarketDisplayTimeframes,
  readMarketSymbols,
  readMarketTimeframes,
} from './environment.js';
import { USDT_BRL_PAIR } from './exchange/exchange.constant.js';
import { createApiClient } from './http/api-client.js';
import { queryRetryDelay, shouldRetryQuery } from './http/rate-limit.js';
import { createStreamConnector } from './live/stream-connector.js';
import { createSessionService } from './session/session-service.js';
import './styles/global.css';
import { applyStoredTheme } from './theme/theme-store.js';

// Dado recém-buscado vale por alguns segundos: trocar de aba ou remontar um cartão não refaz o pedido (o aviso do stream refaz).
const QUERY_STALE_MILLISECONDS = 10_000;
const ROOT_ELEMENT_ID = 'root';
const SERVICE_WORKER_PATH = '/sw.js';

function registerServiceWorker(): void {
  if (!isProductionBuild() || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register(SERVICE_WORKER_PATH);
}

function buildAppConfig(environment: ReturnType<typeof loadEnvironment>): AppConfig {
  return {
    authorizeUrl: environment.VITE_KEYCLOAK_AUTHORIZE_URL,
    clientId: environment.VITE_KEYCLOAK_CLIENT_ID,
    marketSymbols: readMarketSymbols(environment),
    marketTimeframes: readMarketTimeframes(environment),
    marketDisplayTimeframes: readMarketDisplayTimeframes(environment),
  };
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
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        retryDelay: queryRetryDelay,
        staleTime: QUERY_STALE_MILLISECONDS,
      },
    },
  });
  const config = buildAppConfig(environment);
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
