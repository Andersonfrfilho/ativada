// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createContext } from 'react';

import type { ApiClient } from '../http/api-client.js';
import type { StreamConnector } from '../live/stream-connector.js';
import type { LoginConfig } from '../session/login-redirect.js';
import type { SessionService } from '../session/session-service.js';

export type AppConfig = LoginConfig & {
  readonly marketSymbols: readonly string[];
  // As velas habilitadas no ambiente da API (o gráfico só oferece estas); sem a lista, todas as que o painel conhece.
  readonly marketTimeframes?: readonly string[];
  // As velas só de exibição (3m) que o ambiente grava; o gráfico só as oferece sobre execuções de 15 min.
  readonly marketDisplayTimeframes?: readonly string[];
  // Só os testes encurtam: padrão de 2 s para acompanhar execução na fila ou rodando.
  readonly runPollMilliseconds?: number;
  // Polling de reserva dos preços quando o socket está fora (RF16: 15 s).
  readonly fallbackPollMilliseconds?: number;
  // Só os testes encurtam: padrão de 10 s sem tick para o par deixar de valer como ao vivo.
  readonly silenceMilliseconds?: number;
  // Só os testes encurtam: padrão de 8 s de vida do aviso na tela (D7-A).
  readonly noticeToastMilliseconds?: number;
  // Só os testes encurtam: padrão de 5 s de socket caído até a faixa "Avisos pausados" (RF19).
  readonly noticeConnectionMilliseconds?: number;
};

export const AppConfigContext = createContext<AppConfig | undefined>(undefined);
export const SessionContext = createContext<SessionService | undefined>(undefined);
export const ApiClientContext = createContext<ApiClient | undefined>(undefined);
export const StreamConnectorContext = createContext<StreamConnector | undefined>(undefined);
