// Copyright (c) 2026 Ada Technology. All rights reserved.
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useEffect, type ReactElement, type ReactNode } from 'react';

import type { ApiClient } from '../http/api-client.js';
import type { SessionService } from '../session/session-service.js';
import {
  ApiClientContext,
  AppConfigContext,
  SessionContext,
  type AppConfig,
} from './app-context.js';

export type AppProvidersProps = {
  readonly config: AppConfig;
  readonly session: SessionService;
  readonly apiClient: ApiClient;
  readonly queryClient: QueryClient;
  readonly children: ReactNode;
};

export function AppProviders(props: AppProvidersProps): ReactElement {
  const { session } = props;

  // Ao abrir a página não há token em memória: o refresh pelo cookie decide se há sessão.
  useEffect(() => {
    void session.getAccessToken();
  }, [session]);

  return (
    <AppConfigContext value={props.config}>
      <SessionContext value={session}>
        <ApiClientContext value={props.apiClient}>
          <QueryClientProvider client={props.queryClient}>{props.children}</QueryClientProvider>
        </ApiClientContext>
      </SessionContext>
    </AppConfigContext>
  );
}
