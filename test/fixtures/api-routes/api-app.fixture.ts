// Copyright (c) 2026 Ada Technology. All rights reserved.
import type * as TokenVerifierModule from '../../../apps/api-ativada/src/authentication/access-token-verifier.js';
import type * as KeyResolverModule from '../../../apps/api-ativada/src/authentication/remote-key-resolver.js';
import type * as CreateRequestHandlerModule from '../../../apps/api-ativada/src/http/create-request-handler.js';
import type * as LoggerModule from '../../../apps/api-ativada/src/logging/logger.js';
import type * as CandlesUseCaseModule from '../../../apps/api-ativada/src/markets/list-candles.use-case.js';
import type * as SentimentRoutesModule from '../../../apps/api-ativada/src/markets/sentiment.routes.js';
import type * as SentimentUseCaseModule from '../../../apps/api-ativada/src/markets/sentiment.use-case.js';
import type * as MarketRoutesModule from '../../../apps/api-ativada/src/markets/markets.routes.js';
import type * as PolicyModule from '../../../apps/api-ativada/src/rate-limit/rate-limit-policy.constant.js';
import type * as RateLimiterModule from '../../../apps/api-ativada/src/rate-limit/rate-limiter.js';
import type * as CreateRouterModule from '../../../apps/api-ativada/src/router/create-router.js';
import type * as CreateRunModule from '../../../apps/api-ativada/src/runs/create-run.use-case.js';
import type * as RunCursorModule from '../../../apps/api-ativada/src/runs/run-cursor.js';
import type * as StrategyCursorModule from '../../../apps/api-ativada/src/strategies/strategy-cursor.js';
import type * as IntervalTimersModule from '../../../apps/api-ativada/src/runs/queue/interval-timers.js';
import type * as RunQueueDispatcherModule from '../../../apps/api-ativada/src/runs/queue/run-queue-dispatcher.js';
import type * as ApplicationDispatcherModule from '../../../apps/api-ativada/src/runs/queue/create-application-dispatcher.js';
import type * as RunAdmissionModule from '../../../apps/api-ativada/src/runs/run-admission.js';
import type * as ExportCsvModule from '../../../apps/api-ativada/src/runs/export-run-csv.use-case.js';
import type * as RunExportRoutesModule from '../../../apps/api-ativada/src/runs/run-export.routes.js';
import type * as RunSeriesRoutesModule from '../../../apps/api-ativada/src/runs/run-series.routes.js';
import type * as RunSeriesUseCasesModule from '../../../apps/api-ativada/src/runs/run-series.use-cases.js';
import type * as RunUseCasesModule from '../../../apps/api-ativada/src/runs/run.use-cases.js';
import type * as RunRoutesModule from '../../../apps/api-ativada/src/runs/runs.routes.js';
import type * as BuildOpenApiModule from '../../../apps/api-ativada/src/openapi/build-openapi-document.js';
import type * as UndocumentedErrorModule from '../../../apps/api-ativada/src/openapi/undocumented-route.error.js';
import type * as CreateApiRoutesModule from '../../../apps/api-ativada/src/routes/create-api-routes.js';
import type * as DocsConstantModule from '../../../apps/api-ativada/src/docs/docs.constant.js';
import type * as ErrorCatalogModule from '../../../apps/api-ativada/src/shared/errors/error-code-catalog.js';
import type * as SecurityConstantModule from '../../../apps/api-ativada/src/http/http-security.constant.js';
import type * as StrategyRoutesModule from '../../../apps/api-ativada/src/strategies/strategies.routes.js';
import type * as GoalCandlesModule from '../../../apps/api-ativada/src/goals/goal-evaluation-candles.js';
import type * as GoalCacheModule from '../../../apps/api-ativada/src/goals/goal-evaluation-cache.js';
import type * as GoalEvaluationModule from '../../../apps/api-ativada/src/goals/goal-evaluation.use-case.js';
import type * as GoalColdBudgetModule from '../../../apps/api-ativada/src/goals/goal-cold-budget.js';
import type * as GoalColdGateModule from '../../../apps/api-ativada/src/goals/goal-cold-gate.js';
import type * as GoalComputationModule from '../../../apps/api-ativada/src/goals/goal-computation.js';
import type * as GoalSeriesModule from '../../../apps/api-ativada/src/goals/goal-evaluation-series.js';
import type * as GoalPlanCacheModule from '../../../apps/api-ativada/src/goals/goal-plan-cache.js';
import type * as GoalPlanModule from '../../../apps/api-ativada/src/goals/goal-plan.use-case.js';
import type * as AssetPositionModule from '../../../apps/api-ativada/src/assets/asset-position.js';
import type * as AssetRuleModule from '../../../apps/api-ativada/src/assets/asset-rule.js';
import type * as AssetSummaryModule from '../../../apps/api-ativada/src/assets/asset-summary.use-case.js';
import type * as AssetUseCasesModule from '../../../apps/api-ativada/src/assets/asset.use-cases.js';
import type * as AssetRoutesModule from '../../../apps/api-ativada/src/assets/assets.routes.js';
import type * as PriceAlertEvaluatorModule from '../../../apps/api-ativada/src/price-alerts/price-alert-evaluator.js';
import type * as PriceAlertEventDispatcherModule from '../../../apps/api-ativada/src/price-alerts/price-alert-event-dispatcher.js';
import type * as PriceAlertRoutesModule from '../../../apps/api-ativada/src/price-alerts/price-alerts.routes.js';
import type * as PriceAlertUseCasesModule from '../../../apps/api-ativada/src/price-alerts/price-alert.use-cases.js';
import type * as GoalRoutesModule from '../../../apps/api-ativada/src/goals/goals.routes.js';
import type * as GoalUseCasesModule from '../../../apps/api-ativada/src/goals/goal.use-cases.js';
import type * as StrategyUseCasesModule from '../../../apps/api-ativada/src/strategies/strategy.use-cases.js';
import type * as SeedExampleModule from '../../../apps/api-ativada/src/strategies/seed-example-strategy.use-case.js';
import type * as SeedingResolverModule from '../../../apps/api-ativada/src/strategies/example-seeding-user-resolver.js';

const PRODUCTION_APP_SOURCE = new URL('../../../apps/api-ativada/src', import.meta.url).pathname;

// Os contratos das rotas rodam contra a produção; o teste de mutantes os relança num processo à parte apontando esta
// variável para uma cópia mutada do `src` INTEIRO da API (o roteador, os erros e as rotas vêm todos da mesma raiz).
export const API_ROUTES_APP_SOURCE_VARIABLE = 'API_ROUTES_APP_SOURCE';

export type ApiApp = {
  readonly tokenVerifier: typeof TokenVerifierModule;
  readonly keyResolver: typeof KeyResolverModule;
  readonly requestHandler: typeof CreateRequestHandlerModule;
  readonly logger: typeof LoggerModule;
  readonly candlesUseCase: typeof CandlesUseCaseModule;
  readonly marketRoutes: typeof MarketRoutesModule;
  readonly sentimentRoutes: typeof SentimentRoutesModule;
  readonly sentimentUseCase: typeof SentimentUseCaseModule;
  readonly policies: typeof PolicyModule;
  readonly rateLimiter: typeof RateLimiterModule;
  readonly router: typeof CreateRouterModule;
  readonly createRun: typeof CreateRunModule;
  readonly runQueueDispatcher: typeof RunQueueDispatcherModule;
  readonly intervalTimers: typeof IntervalTimersModule;
  readonly runCursor: typeof RunCursorModule;
  readonly strategyCursor: typeof StrategyCursorModule;
  readonly applicationDispatcher: typeof ApplicationDispatcherModule;
  readonly runAdmission: typeof RunAdmissionModule;
  readonly exportCsv: typeof ExportCsvModule;
  readonly runExportRoutes: typeof RunExportRoutesModule;
  readonly runSeriesRoutes: typeof RunSeriesRoutesModule;
  readonly runSeriesUseCases: typeof RunSeriesUseCasesModule;
  readonly runUseCases: typeof RunUseCasesModule;
  readonly runRoutes: typeof RunRoutesModule;
  readonly strategyRoutes: typeof StrategyRoutesModule;
  readonly strategyUseCases: typeof StrategyUseCasesModule;
  readonly goalRoutes: typeof GoalRoutesModule;
  readonly goalUseCases: typeof GoalUseCasesModule;
  readonly goalEvaluation: typeof GoalEvaluationModule;
  readonly goalCache: typeof GoalCacheModule;
  readonly goalColdBudget: typeof GoalColdBudgetModule;
  readonly goalColdGate: typeof GoalColdGateModule;
  readonly goalComputation: typeof GoalComputationModule;
  readonly assetPosition: typeof AssetPositionModule;
  readonly assetRule: typeof AssetRuleModule;
  readonly assetSummary: typeof AssetSummaryModule;
  readonly assetUseCases: typeof AssetUseCasesModule;
  readonly assetRoutes: typeof AssetRoutesModule;
  readonly priceAlertEvaluator: typeof PriceAlertEvaluatorModule;
  readonly priceAlertEventDispatcher: typeof PriceAlertEventDispatcherModule;
  readonly priceAlertRoutes: typeof PriceAlertRoutesModule;
  readonly priceAlertUseCases: typeof PriceAlertUseCasesModule;
  readonly goalPlan: typeof GoalPlanModule;
  readonly goalPlanCache: typeof GoalPlanCacheModule;
  readonly goalCandles: typeof GoalCandlesModule;
  readonly goalSeries: typeof GoalSeriesModule;
  readonly seedExample: typeof SeedExampleModule;
  readonly seedingResolver: typeof SeedingResolverModule;
  readonly openApi: typeof BuildOpenApiModule;
  readonly undocumentedError: typeof UndocumentedErrorModule;
  readonly apiRoutes: typeof CreateApiRoutesModule;
  readonly docsConstant: typeof DocsConstantModule;
  readonly errorCatalog: typeof ErrorCatalogModule;
  readonly securityConstant: typeof SecurityConstantModule;
};

export function resolveApiAppSource(): string {
  return Bun.env[API_ROUTES_APP_SOURCE_VARIABLE] ?? PRODUCTION_APP_SOURCE;
}

async function load<TModule>(file: string): Promise<TModule> {
  const module: unknown = await import(`${resolveApiAppSource()}/${file}.ts`);
  return module as TModule;
}

export async function loadApiApp(): Promise<ApiApp> {
  return {
    tokenVerifier: await load('authentication/access-token-verifier'),
    keyResolver: await load('authentication/remote-key-resolver'),
    requestHandler: await load('http/create-request-handler'),
    logger: await load('logging/logger'),
    candlesUseCase: await load('markets/list-candles.use-case'),
    marketRoutes: await load('markets/markets.routes'),
    sentimentRoutes: await load('markets/sentiment.routes'),
    sentimentUseCase: await load('markets/sentiment.use-case'),
    policies: await load('rate-limit/rate-limit-policy.constant'),
    rateLimiter: await load('rate-limit/rate-limiter'),
    router: await load('router/create-router'),
    createRun: await load('runs/create-run.use-case'),
    runQueueDispatcher: await load('runs/queue/run-queue-dispatcher'),
    intervalTimers: await load('runs/queue/interval-timers'),
    runCursor: await load('runs/run-cursor'),
    strategyCursor: await load('strategies/strategy-cursor'),
    applicationDispatcher: await load('runs/queue/create-application-dispatcher'),
    runAdmission: await load('runs/run-admission'),
    exportCsv: await load('runs/export-run-csv.use-case'),
    runExportRoutes: await load('runs/run-export.routes'),
    runSeriesRoutes: await load('runs/run-series.routes'),
    runSeriesUseCases: await load('runs/run-series.use-cases'),
    runUseCases: await load('runs/run.use-cases'),
    runRoutes: await load('runs/runs.routes'),
    strategyRoutes: await load('strategies/strategies.routes'),
    strategyUseCases: await load('strategies/strategy.use-cases'),
    goalRoutes: await load('goals/goals.routes'),
    goalUseCases: await load('goals/goal.use-cases'),
    goalEvaluation: await load('goals/goal-evaluation.use-case'),
    goalCache: await load('goals/goal-evaluation-cache'),
    goalColdBudget: await load('goals/goal-cold-budget'),
    goalColdGate: await load('goals/goal-cold-gate'),
    goalComputation: await load('goals/goal-computation'),
    assetPosition: await load('assets/asset-position'),
    assetRule: await load('assets/asset-rule'),
    assetSummary: await load('assets/asset-summary.use-case'),
    assetUseCases: await load('assets/asset.use-cases'),
    assetRoutes: await load('assets/assets.routes'),
    priceAlertEvaluator: await load('price-alerts/price-alert-evaluator'),
    priceAlertEventDispatcher: await load('price-alerts/price-alert-event-dispatcher'),
    priceAlertRoutes: await load('price-alerts/price-alerts.routes'),
    priceAlertUseCases: await load('price-alerts/price-alert.use-cases'),
    goalPlan: await load('goals/goal-plan.use-case'),
    goalPlanCache: await load('goals/goal-plan-cache'),
    goalCandles: await load('goals/goal-evaluation-candles'),
    goalSeries: await load('goals/goal-evaluation-series'),
    seedExample: await load('strategies/seed-example-strategy.use-case'),
    seedingResolver: await load('strategies/example-seeding-user-resolver'),
    openApi: await load('openapi/build-openapi-document'),
    undocumentedError: await load('openapi/undocumented-route.error'),
    apiRoutes: await load('routes/create-api-routes'),
    docsConstant: await load('docs/docs.constant'),
    errorCatalog: await load('shared/errors/error-code-catalog'),
    securityConstant: await load('http/http-security.constant'),
  };
}
