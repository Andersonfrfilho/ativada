// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useContext, useSyncExternalStore } from 'react';

import type { StreamConnector } from '../live/stream-connector.js';
import type { ApiClient } from '../http/api-client.js';
import type { SessionStatus } from '../session/session.constant.js';
import type { SessionService } from '../session/session-service.js';
import {
  ApiClientContext,
  AppConfigContext,
  SessionContext,
  StreamConnectorContext,
  type AppConfig,
} from './app-context.js';

const MISSING_PROVIDER = 'AppProviders não envolve esta árvore.';

export function useAppConfig(): AppConfig {
  const config = useContext(AppConfigContext);
  if (config === undefined) throw new Error(MISSING_PROVIDER);
  return config;
}

export function useSessionService(): SessionService {
  const session = useContext(SessionContext);
  if (session === undefined) throw new Error(MISSING_PROVIDER);
  return session;
}

export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (client === undefined) throw new Error(MISSING_PROVIDER);
  return client;
}

export function useSessionStatus(): SessionStatus {
  const session = useSessionService();
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}

export function useStreamConnector(): StreamConnector {
  const connector = useContext(StreamConnectorContext);
  if (connector === undefined) throw new Error(MISSING_PROVIDER);
  return connector;
}

export function useRenewalProblem(): boolean {
  const session = useSessionService();
  return useSyncExternalStore(session.subscribe, session.hasRenewalProblem);
}

export function useUnconfirmedSignOut(): boolean {
  const session = useSessionService();
  return useSyncExternalStore(session.subscribe, session.hasUnconfirmedSignOut);
}
