// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createContext } from 'react';

import type { ApiClient } from '../http/api-client.js';
import type { LoginConfig } from '../session/login-redirect.js';
import type { SessionService } from '../session/session-service.js';

export type AppConfig = LoginConfig & {
  readonly marketSymbols: readonly string[];
};

export const AppConfigContext = createContext<AppConfig | undefined>(undefined);
export const SessionContext = createContext<SessionService | undefined>(undefined);
export const ApiClientContext = createContext<ApiClient | undefined>(undefined);
