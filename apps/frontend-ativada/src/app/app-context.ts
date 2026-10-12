// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createContext } from 'react';

import type { ApiClient } from '../http/api-client.js';
import type { StreamConnector } from '../live/stream-connector.js';
import type { LoginConfig } from '../session/login-redirect.js';
import type { SessionService } from '../session/session-service.js';

export type AppConfig = LoginConfig & {
  readonly marketSymbols: readonly string[];
  // Só os testes encurtam: padrão de 2 s para acompanhar execução na fila ou rodando.
  readonly runPollMilliseconds?: number;
  // Polling de reserva dos preços quando o socket está fora (RF16: 15 s).
  readonly fallbackPollMilliseconds?: number;
  // Só os testes encurtam: padrão de 10 s sem tick para o par deixar de valer como ao vivo.
  readonly silenceMilliseconds?: number;
};

export const AppConfigContext = createContext<AppConfig | undefined>(undefined);
export const SessionContext = createContext<SessionService | undefined>(undefined);
export const ApiClientContext = createContext<ApiClient | undefined>(undefined);
export const StreamConnectorContext = createContext<StreamConnector | undefined>(undefined);
