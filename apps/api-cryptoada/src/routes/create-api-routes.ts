// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createAccountRoutes, type AccountRouteDependencies } from '../account/account.routes.js';
import { createAdminRoutes, type AdminRouteDependencies } from '../admin/admin.routes.js';
import { createDocsRoutes } from '../docs/docs.routes.js';
import { createMarketRoutes, type MarketRouteDependencies } from '../markets/markets.routes.js';
import { createProfileRoutes, type ProfileRouteDependencies } from '../profile/profile.routes.js';
import type { Route } from '../router/route.types.js';
import type { ExportRunCsvUseCase } from '../runs/export-run-csv.use-case.js';
import { createRunExportRoutes } from '../runs/run-export.routes.js';
import { createRunSeriesRoutes } from '../runs/run-series.routes.js';
import type { RunSeriesUseCases } from '../runs/run-series.use-cases.js';
import { createRunRoutes, type RunRouteDependencies } from '../runs/runs.routes.js';
import { createSessionRoutes, type SessionRouteDependencies } from '../session/session.routes.js';
import {
  createStrategyRoutes,
  type StrategyRouteDependencies,
} from '../strategies/strategies.routes.js';
import {
  createTelegramRoutes,
  type TelegramRouteDependencies,
} from '../telegram/telegram.routes.js';
import type { StreamTicketStore } from '../stream/stream-ticket-store.js';
import { createStreamTicketRoutes } from '../stream/stream-ticket.routes.js';
import { createHealthRoutes, type HealthRouteDependencies } from './health.routes.js';

export type RunRoutesBundle = {
  readonly routes: RunRouteDependencies;
  readonly series: RunSeriesUseCases;
  readonly exportRunCsv: ExportRunCsvUseCase;
};

export type ApiRouteDependencies = HealthRouteDependencies & {
  readonly session: SessionRouteDependencies;
  readonly account: AccountRouteDependencies;
  readonly profile: ProfileRouteDependencies;
  readonly telegram: TelegramRouteDependencies;
  readonly admin: AdminRouteDependencies;
  readonly streamTicketStore: StreamTicketStore;
  readonly markets: MarketRouteDependencies;
  readonly strategies: StrategyRouteDependencies;
  readonly runs: RunRoutesBundle;
  // `/v1/openapi.json` e `/v1/docs` existem só fora de produção: em produção nem entram na tabela.
  readonly isDocumentationEnabled: boolean;
};

export function createApiRoutes(dependencies: ApiRouteDependencies): readonly Route[] {
  const routes: Route[] = [
    ...createHealthRoutes(dependencies),
    ...createSessionRoutes(dependencies.session),
    ...createProfileRoutes(dependencies.profile),
    ...createAccountRoutes(dependencies.account),
    ...createTelegramRoutes(dependencies.telegram),
    ...createAdminRoutes(dependencies.admin),
    ...createStreamTicketRoutes(dependencies.streamTicketStore),
    ...createMarketRoutes(dependencies.markets),
    ...createStrategyRoutes(dependencies.strategies),
    ...createRunRoutes(dependencies.runs.routes),
    ...createRunSeriesRoutes(dependencies.runs.series),
    ...createRunExportRoutes(dependencies.runs.exportRunCsv),
  ];
  // A tabela final inclui as próprias rotas de documentação: o documento é gerado depois, dela inteira.
  if (dependencies.isDocumentationEnabled) routes.push(...createDocsRoutes(() => routes));
  return routes;
}
