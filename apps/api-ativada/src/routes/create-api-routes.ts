// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createAccountRoutes, type AccountRouteDependencies } from '../account/account.routes.js';
import { createAdminRoutes, type AdminRouteDependencies } from '../admin/admin.routes.js';
import { createAssetRoutes, type AssetRouteDependencies } from '../assets/assets.routes.js';
import { createDocsRoutes } from '../docs/docs.routes.js';
import { createGoalRoutes, type GoalRouteDependencies } from '../goals/goals.routes.js';
import { createHorizonRoutes, type HorizonRouteDependencies } from '../horizons/horizons.routes.js';
import {
  createPriceAlertRoutes,
  type PriceAlertRouteDependencies,
} from '../price-alerts/price-alerts.routes.js';
import { createMarketRoutes, type MarketRouteDependencies } from '../markets/markets.routes.js';
import {
  createSentimentRoutes,
  type SentimentRouteDependencies,
} from '../markets/sentiment.routes.js';
import { createNoticesRoute } from '../notices/notices.route.js';
import type { ListNoticesUseCase } from '../notices/list-notices.use-case.js';
import { createProfileRoutes, type ProfileRouteDependencies } from '../profile/profile.routes.js';
import type { Route } from '../router/route.types.js';
import { createRunChartRoute } from '../runs/chart/run-chart.route.js';
import type { RunChartUseCase } from '../runs/chart/run-chart.use-case.js';
import type { AnalystDecisionsUseCase } from '../runs/analyst/analyst-decisions.use-case.js';
import { createAnalystDecisionsRoute, createAnalystRoute } from '../runs/analyst/analyst.route.js';
import type { AnalystUseCase } from '../runs/analyst/analyst.use-case.js';
import { createLiveStatusRoute } from '../runs/live-status/live-status.route.js';
import type { LiveStatusUseCase } from '../runs/live-status/live-status.use-case.js';
import { createLiveSummaryRoute } from '../runs/live-summary/live-summary.route.js';
import type { LiveSummaryUseCase } from '../runs/live-summary/live-summary.use-case.js';
import { createRunDecisionsRoute } from '../runs/live-status/run-decisions.route.js';
import { createProjectionsRoute } from '../runs/projections/projections.route.js';
import type { ProjectionsUseCase } from '../runs/projections/projections.use-case.js';
import { createStrategyLayersRoute } from '../runs/projections/strategy-layers.route.js';
import type { StrategyLayersUseCase } from '../runs/projections/strategy-layers.use-case.js';
import type { RunDecisionsUseCase } from '../runs/live-status/run-decisions.use-case.js';
import { createTradeSummaryRoute } from '../runs/trade-summary/trade-summary.route.js';
import type { TradeSummaryUseCase } from '../runs/trade-summary/trade-summary.use-case.js';
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
  readonly chart: RunChartUseCase;
  readonly tradeSummary: TradeSummaryUseCase;
  readonly liveStatus: LiveStatusUseCase;
  readonly liveSummary: LiveSummaryUseCase;
  readonly decisions: RunDecisionsUseCase;
  readonly strategyLayers: StrategyLayersUseCase;
  readonly projections: ProjectionsUseCase;
  readonly analyst: AnalystUseCase;
  readonly analystDecisions: AnalystDecisionsUseCase;
};

// O que as leituras do acompanhamento ao vivo entregam ao pacote de rotas de execuções.
export type LiveAwareUseCases = Pick<
  RunRoutesBundle,
  'chart' | 'liveStatus' | 'liveSummary' | 'decisions' | 'strategyLayers' | 'projections'
>;

export type ApiRouteDependencies = HealthRouteDependencies & {
  readonly session: SessionRouteDependencies;
  readonly account: AccountRouteDependencies;
  readonly profile: ProfileRouteDependencies;
  readonly telegram: TelegramRouteDependencies;
  readonly admin: AdminRouteDependencies;
  readonly streamTicketStore: StreamTicketStore;
  readonly markets: MarketRouteDependencies;
  readonly sentiment: SentimentRouteDependencies;
  readonly strategies: StrategyRouteDependencies;
  readonly goals: GoalRouteDependencies;
  readonly horizons: HorizonRouteDependencies;
  readonly priceAlerts: PriceAlertRouteDependencies;
  readonly assets: AssetRouteDependencies;
  readonly listNotices: ListNoticesUseCase;
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
    ...createSentimentRoutes(dependencies.sentiment),
    ...createStrategyRoutes(dependencies.strategies),
    ...createGoalRoutes(dependencies.goals),
    ...createHorizonRoutes(dependencies.horizons),
    ...createPriceAlertRoutes(dependencies.priceAlerts),
    ...createAssetRoutes(dependencies.assets),
    createNoticesRoute(dependencies.listNotices),
    ...createRunRoutes(dependencies.runs.routes),
    ...createRunSeriesRoutes(dependencies.runs.series),
    createRunChartRoute(dependencies.runs.chart),
    createTradeSummaryRoute(dependencies.runs.tradeSummary),
    createLiveStatusRoute(dependencies.runs.liveStatus),
    createLiveSummaryRoute(dependencies.runs.liveSummary),
    createRunDecisionsRoute(dependencies.runs.decisions),
    createStrategyLayersRoute(dependencies.runs.strategyLayers),
    createProjectionsRoute(dependencies.runs.projections),
    createAnalystRoute(dependencies.runs.analyst),
    createAnalystDecisionsRoute(dependencies.runs.analystDecisions),
    ...createRunExportRoutes(dependencies.runs.exportRunCsv),
  ];
  // A tabela final inclui as próprias rotas de documentação: o documento é gerado depois, dela inteira.
  if (dependencies.isDocumentationEnabled) routes.push(...createDocsRoutes(() => routes));
  return routes;
}
