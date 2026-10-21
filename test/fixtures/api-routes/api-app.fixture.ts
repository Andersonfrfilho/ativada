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
import type * as RunChartRouteModule from '../../../apps/api-ativada/src/runs/chart/run-chart.route.js';
import type * as RunChartUseCaseModule from '../../../apps/api-ativada/src/runs/chart/run-chart.use-case.js';
import type * as TradeSummaryRouteModule from '../../../apps/api-ativada/src/runs/trade-summary/trade-summary.route.js';
import type * as TradeSummaryUseCaseModule from '../../../apps/api-ativada/src/runs/trade-summary/trade-summary.use-case.js';
import type * as TradeSummaryMessageModule from '../../../apps/api-ativada/src/runs/trade-summary/trade-summary-message.js';
import type * as LiveStatusRouteModule from '../../../apps/api-ativada/src/runs/live-status/live-status.route.js';
import type * as LiveStatusUseCaseModule from '../../../apps/api-ativada/src/runs/live-status/live-status.use-case.js';
import type * as LiveSummaryRouteModule from '../../../apps/api-ativada/src/runs/live-summary/live-summary.route.js';
import type * as LiveSummaryUseCaseModule from '../../../apps/api-ativada/src/runs/live-summary/live-summary.use-case.js';
import type * as RunDecisionsRouteModule from '../../../apps/api-ativada/src/runs/live-status/run-decisions.route.js';
import type * as RunDecisionsUseCaseModule from '../../../apps/api-ativada/src/runs/live-status/run-decisions.use-case.js';
import type * as StrategyLayersRouteModule from '../../../apps/api-ativada/src/runs/projections/strategy-layers.route.js';
import type * as StrategyLayersUseCaseModule from '../../../apps/api-ativada/src/runs/projections/strategy-layers.use-case.js';
import type * as AnalystRouteModule from '../../../apps/api-ativada/src/runs/analyst/analyst.route.js';
import type * as AnalystUseCaseModule from '../../../apps/api-ativada/src/runs/analyst/analyst.use-case.js';
import type * as AnalystDecisionsUseCaseModule from '../../../apps/api-ativada/src/runs/analyst/analyst-decisions.use-case.js';
import type * as AnalystViewModule from '../../../apps/api-ativada/src/runs/analyst/analyst-view.js';
import type * as AnalystCurrentModule from '../../../apps/api-ativada/src/runs/analyst/analyst-current.js';
import type * as AnalystGoalProgressModule from '../../../apps/api-ativada/src/runs/analyst/analyst-goal-progress.js';
import type * as ProjectionsRouteModule from '../../../apps/api-ativada/src/runs/projections/projections.route.js';
import type * as ProjectionsUseCaseModule from '../../../apps/api-ativada/src/runs/projections/projections.use-case.js';
import type * as TradePlanRouteModule from '../../../apps/api-ativada/src/runs/trade-plan/trade-plan.route.js';
import type * as TradePlanUseCaseModule from '../../../apps/api-ativada/src/runs/trade-plan/trade-plan.use-case.js';
import type * as QuestionsRouteModule from '../../../apps/api-ativada/src/runs/questions/questions.route.js';
import type * as QuestionsUseCaseModule from '../../../apps/api-ativada/src/runs/questions/questions.use-case.js';
import type * as QuestionReadingsModule from '../../../apps/api-ativada/src/runs/questions/question-readings.js';
import type * as ProjectionRuleModule from '../../../apps/api-ativada/src/runs/projections/projection-rule.js';
import type * as ProjectionMessagesModule from '../../../apps/api-ativada/src/runs/projections/projection-messages.js';
import type * as LiveBalanceModule from '../../../apps/api-ativada/src/runs/live-status/live-balance.js';
import type * as LiveGoalProgressModule from '../../../apps/api-ativada/src/runs/live-status/live-goal-progress.js';
import type * as DecisionConditionModule from '../../../apps/api-ativada/src/runs/live-status/decision-condition.js';
import type * as DecisionMessagesModule from '../../../apps/api-ativada/src/runs/live-status/decision-messages.js';
import type * as TriggerMessagesModule from '../../../apps/api-ativada/src/runs/live-status/trigger-messages.js';
import type * as LiveStatusMessagesModule from '../../../apps/api-ativada/src/runs/live-status/live-status-messages.js';
import type * as LiveNumberFormatModule from '../../../apps/api-ativada/src/runs/live-status/live-number-format.js';
import type * as StoredReadingsModule from '../../../apps/api-ativada/src/runs/live-status/stored-readings.js';
import type * as RunSeriesRoutesModule from '../../../apps/api-ativada/src/runs/run-series.routes.js';
import type * as RunSeriesUseCasesModule from '../../../apps/api-ativada/src/runs/run-series.use-cases.js';
import type * as RunUseCasesModule from '../../../apps/api-ativada/src/runs/run.use-cases.js';
import type * as RunRoutesModule from '../../../apps/api-ativada/src/runs/runs.routes.js';
import type * as BuildOpenApiModule from '../../../apps/api-ativada/src/openapi/build-openapi-document.js';
import type * as UndocumentedErrorModule from '../../../apps/api-ativada/src/openapi/undocumented-route.error.js';
import type * as HealthDependenciesModule from '../../../apps/api-ativada/src/health/create-health-dependencies.js';
import type * as HealthViewModule from '../../../apps/api-ativada/src/health/health-view.js';
import type * as CreateApiRoutesModule from '../../../apps/api-ativada/src/routes/create-api-routes.js';
import type * as DocsConstantModule from '../../../apps/api-ativada/src/docs/docs.constant.js';
import type * as ErrorCatalogModule from '../../../apps/api-ativada/src/shared/errors/error-code-catalog.js';
import type * as SecurityConstantModule from '../../../apps/api-ativada/src/http/http-security.constant.js';
import type * as StrategyRoutesModule from '../../../apps/api-ativada/src/strategies/strategies.routes.js';
import type * as GoalCandlesModule from '../../../apps/api-ativada/src/goals/goal-evaluation-candles.js';
import type * as GoalCacheModule from '../../../apps/api-ativada/src/goals/goal-evaluation-cache.js';
import type * as GoalEvaluationModule from '../../../apps/api-ativada/src/goals/goal-evaluation.use-case.js';
import type * as GoalColdBudgetModule from '../../../apps/api-ativada/src/goals/goal-cold-budget.js';
import type * as ColdWiringModule from '../../../apps/api-ativada/src/routes/create-cold-evaluation-gates.js';
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
import type * as NoticesRouteModule from '../../../apps/api-ativada/src/notices/notices.route.js';
import type * as NoticesUseCaseModule from '../../../apps/api-ativada/src/notices/list-notices.use-case.js';
import type * as NoticeViewModule from '../../../apps/api-ativada/src/notices/notice-view.js';
import type * as NoticeMessagesModule from '../../../apps/api-ativada/src/notices/notice-messages.js';
import type * as NoticeContentModule from '../../../apps/api-ativada/src/notices/notice-content.js';
import type * as PriceAlertRoutesModule from '../../../apps/api-ativada/src/price-alerts/price-alerts.routes.js';
import type * as PriceAlertUseCasesModule from '../../../apps/api-ativada/src/price-alerts/price-alert.use-cases.js';
import type * as HorizonBestModule from '../../../apps/api-ativada/src/horizons/horizon-best.js';
import type * as HorizonIntradayRunModule from '../../../apps/api-ativada/src/horizons/horizon-intraday-run.js';
import type * as HorizonMessagesModule from '../../../apps/api-ativada/src/horizons/horizon-messages.js';
import type * as HorizonRoutesModule from '../../../apps/api-ativada/src/horizons/horizons.routes.js';
import type * as HorizonViewModule from '../../../apps/api-ativada/src/horizons/horizon-view.js';
import type * as HorizonCacheModule from '../../../apps/api-ativada/src/horizons/horizon-cache.js';
import type * as HorizonComputationModule from '../../../apps/api-ativada/src/horizons/horizon-computation.js';
import type * as HorizonEvaluationModule from '../../../apps/api-ativada/src/horizons/horizon-evaluation.use-case.js';
import type * as GoalRoutesModule from '../../../apps/api-ativada/src/goals/goals.routes.js';
import type * as GoalUseCasesModule from '../../../apps/api-ativada/src/goals/goal.use-cases.js';
import type * as StrategyUseCasesModule from '../../../apps/api-ativada/src/strategies/strategy.use-cases.js';
import type * as SeedExampleModule from '../../../apps/api-ativada/src/strategies/seed-example-strategy.use-case.js';
import type * as SeedingResolverModule from '../../../apps/api-ativada/src/strategies/example-seeding-user-resolver.js';
import type * as StallPolicyModule from '../../../apps/api-ativada/src/runs/stall/stall-policy.js';
import type * as StallSweeperModule from '../../../apps/api-ativada/src/runs/stall/stall-sweeper.js';
import type * as StallSweepLoopModule from '../../../apps/api-ativada/src/runs/stall/stall-sweep-loop.js';
import type * as StallAlertPayloadModule from '../../../apps/api-ativada/src/runs/stall/stall-alert-payload.js';
import type * as MeModelTeamsRoutesModule from '../../../apps/api-ativada/src/model-teams/me-model-teams.routes.js';
import type * as MeModelTeamsUseCaseModule from '../../../apps/api-ativada/src/model-teams/me-model-teams.use-case.js';
import type * as RunModelTeamsRoutesModule from '../../../apps/api-ativada/src/model-teams/run-model-teams.routes.js';
import type * as RunModelTeamsUseCaseModule from '../../../apps/api-ativada/src/model-teams/run-model-teams.use-case.js';
import type * as RunModelTeamsComparisonModule from '../../../apps/api-ativada/src/model-teams/run-model-teams-comparison.use-case.js';
import type * as ModelOpinionRequestModule from '../../../apps/api-ativada/src/model-teams/model-opinion-request.use-case.js';
import type * as ModelDuelRoutesModule from '../../../apps/api-ativada/src/model-teams/model-duels.routes.js';
import type * as ModelDuelCreateModule from '../../../apps/api-ativada/src/model-teams/model-duel-create.use-case.js';
import type * as ModelDuelReadModule from '../../../apps/api-ativada/src/model-teams/model-duel-read.use-case.js';
import type * as ProviderStateModule from '../../../apps/api-ativada/src/model-teams/provider-state.js';

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
  readonly runChartRoute: typeof RunChartRouteModule;
  readonly runChartUseCase: typeof RunChartUseCaseModule;
  readonly tradeSummaryRoute: typeof TradeSummaryRouteModule;
  readonly tradeSummaryUseCase: typeof TradeSummaryUseCaseModule;
  readonly tradeSummaryMessage: typeof TradeSummaryMessageModule;
  readonly liveStatusRoute: typeof LiveStatusRouteModule;
  readonly liveStatusUseCase: typeof LiveStatusUseCaseModule;
  readonly liveSummaryRoute: typeof LiveSummaryRouteModule;
  readonly liveSummaryUseCase: typeof LiveSummaryUseCaseModule;
  readonly runDecisionsRoute: typeof RunDecisionsRouteModule;
  readonly runDecisionsUseCase: typeof RunDecisionsUseCaseModule;
  readonly strategyLayersRoute: typeof StrategyLayersRouteModule;
  readonly strategyLayersUseCase: typeof StrategyLayersUseCaseModule;
  readonly analystRoute: typeof AnalystRouteModule;
  readonly analystUseCase: typeof AnalystUseCaseModule;
  readonly analystDecisionsUseCase: typeof AnalystDecisionsUseCaseModule;
  readonly analystView: typeof AnalystViewModule;
  readonly analystCurrent: typeof AnalystCurrentModule;
  readonly analystGoalProgress: typeof AnalystGoalProgressModule;
  readonly projectionsRoute: typeof ProjectionsRouteModule;
  readonly projectionsUseCase: typeof ProjectionsUseCaseModule;
  readonly tradePlanRoute: typeof TradePlanRouteModule;
  readonly tradePlanUseCase: typeof TradePlanUseCaseModule;
  readonly questionsRoute: typeof QuestionsRouteModule;
  readonly questionsUseCase: typeof QuestionsUseCaseModule;
  readonly questionReadings: typeof QuestionReadingsModule;
  readonly projectionRule: typeof ProjectionRuleModule;
  readonly projectionMessages: typeof ProjectionMessagesModule;
  readonly liveBalance: typeof LiveBalanceModule;
  readonly liveGoalProgress: typeof LiveGoalProgressModule;
  readonly storedReadings: typeof StoredReadingsModule;
  readonly decisionCondition: typeof DecisionConditionModule;
  readonly decisionMessages: typeof DecisionMessagesModule;
  readonly triggerMessages: typeof TriggerMessagesModule;
  readonly liveStatusMessages: typeof LiveStatusMessagesModule;
  readonly liveNumberFormat: typeof LiveNumberFormatModule;
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
  readonly coldWiring: typeof ColdWiringModule;
  readonly goalComputation: typeof GoalComputationModule;
  readonly assetPosition: typeof AssetPositionModule;
  readonly assetRule: typeof AssetRuleModule;
  readonly assetSummary: typeof AssetSummaryModule;
  readonly assetUseCases: typeof AssetUseCasesModule;
  readonly assetRoutes: typeof AssetRoutesModule;
  readonly priceAlertEvaluator: typeof PriceAlertEvaluatorModule;
  readonly priceAlertEventDispatcher: typeof PriceAlertEventDispatcherModule;
  readonly noticesRoute: typeof NoticesRouteModule;
  readonly noticesUseCase: typeof NoticesUseCaseModule;
  readonly noticeView: typeof NoticeViewModule;
  readonly noticeMessages: typeof NoticeMessagesModule;
  readonly noticeContent: typeof NoticeContentModule;
  readonly priceAlertRoutes: typeof PriceAlertRoutesModule;
  readonly priceAlertUseCases: typeof PriceAlertUseCasesModule;
  readonly horizonBest: typeof HorizonBestModule;
  readonly horizonIntradayRun: typeof HorizonIntradayRunModule;
  readonly horizonMessages: typeof HorizonMessagesModule;
  readonly horizonRoutes: typeof HorizonRoutesModule;
  readonly horizonView: typeof HorizonViewModule;
  readonly horizonCache: typeof HorizonCacheModule;
  readonly horizonComputation: typeof HorizonComputationModule;
  readonly horizonEvaluation: typeof HorizonEvaluationModule;
  readonly goalPlan: typeof GoalPlanModule;
  readonly goalPlanCache: typeof GoalPlanCacheModule;
  readonly goalCandles: typeof GoalCandlesModule;
  readonly goalSeries: typeof GoalSeriesModule;
  readonly seedExample: typeof SeedExampleModule;
  readonly seedingResolver: typeof SeedingResolverModule;
  readonly stallPolicy: typeof StallPolicyModule;
  readonly stallSweeper: typeof StallSweeperModule;
  readonly stallSweepLoop: typeof StallSweepLoopModule;
  readonly stallAlertPayload: typeof StallAlertPayloadModule;
  readonly meModelTeamsRoutes: typeof MeModelTeamsRoutesModule;
  readonly meModelTeamsUseCase: typeof MeModelTeamsUseCaseModule;
  readonly runModelTeamsRoutes: typeof RunModelTeamsRoutesModule;
  readonly runModelTeamsUseCase: typeof RunModelTeamsUseCaseModule;
  readonly runModelTeamsComparison: typeof RunModelTeamsComparisonModule;
  readonly modelOpinionRequest: typeof ModelOpinionRequestModule;
  readonly modelDuelRoutes: typeof ModelDuelRoutesModule;
  readonly modelDuelCreate: typeof ModelDuelCreateModule;
  readonly modelDuelRead: typeof ModelDuelReadModule;
  readonly providerState: typeof ProviderStateModule;
  readonly openApi: typeof BuildOpenApiModule;
  readonly undocumentedError: typeof UndocumentedErrorModule;
  readonly apiRoutes: typeof CreateApiRoutesModule;
  readonly healthDependencies: typeof HealthDependenciesModule;
  readonly healthView: typeof HealthViewModule;
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
    runChartRoute: await load('runs/chart/run-chart.route'),
    runChartUseCase: await load('runs/chart/run-chart.use-case'),
    tradeSummaryRoute: await load('runs/trade-summary/trade-summary.route'),
    tradeSummaryUseCase: await load('runs/trade-summary/trade-summary.use-case'),
    tradeSummaryMessage: await load('runs/trade-summary/trade-summary-message'),
    liveStatusRoute: await load('runs/live-status/live-status.route'),
    liveStatusUseCase: await load('runs/live-status/live-status.use-case'),
    liveSummaryRoute: await load('runs/live-summary/live-summary.route'),
    liveSummaryUseCase: await load('runs/live-summary/live-summary.use-case'),
    runDecisionsRoute: await load('runs/live-status/run-decisions.route'),
    runDecisionsUseCase: await load('runs/live-status/run-decisions.use-case'),
    strategyLayersRoute: await load('runs/projections/strategy-layers.route'),
    strategyLayersUseCase: await load('runs/projections/strategy-layers.use-case'),
    analystRoute: await load('runs/analyst/analyst.route'),
    analystUseCase: await load('runs/analyst/analyst.use-case'),
    analystDecisionsUseCase: await load('runs/analyst/analyst-decisions.use-case'),
    analystView: await load('runs/analyst/analyst-view'),
    analystCurrent: await load('runs/analyst/analyst-current'),
    analystGoalProgress: await load('runs/analyst/analyst-goal-progress'),
    projectionsRoute: await load('runs/projections/projections.route'),
    projectionsUseCase: await load('runs/projections/projections.use-case'),
    tradePlanRoute: await load('runs/trade-plan/trade-plan.route'),
    tradePlanUseCase: await load('runs/trade-plan/trade-plan.use-case'),
    questionsRoute: await load('runs/questions/questions.route'),
    questionsUseCase: await load('runs/questions/questions.use-case'),
    questionReadings: await load('runs/questions/question-readings'),
    projectionRule: await load('runs/projections/projection-rule'),
    projectionMessages: await load('runs/projections/projection-messages'),
    liveBalance: await load('runs/live-status/live-balance'),
    liveGoalProgress: await load('runs/live-status/live-goal-progress'),
    storedReadings: await load('runs/live-status/stored-readings'),
    decisionCondition: await load('runs/live-status/decision-condition'),
    decisionMessages: await load('runs/live-status/decision-messages'),
    triggerMessages: await load('runs/live-status/trigger-messages'),
    liveStatusMessages: await load('runs/live-status/live-status-messages'),
    liveNumberFormat: await load('runs/live-status/live-number-format'),
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
    coldWiring: await load('routes/create-cold-evaluation-gates'),
    goalComputation: await load('goals/goal-computation'),
    assetPosition: await load('assets/asset-position'),
    assetRule: await load('assets/asset-rule'),
    assetSummary: await load('assets/asset-summary.use-case'),
    assetUseCases: await load('assets/asset.use-cases'),
    assetRoutes: await load('assets/assets.routes'),
    priceAlertEvaluator: await load('price-alerts/price-alert-evaluator'),
    priceAlertEventDispatcher: await load('price-alerts/price-alert-event-dispatcher'),
    noticesRoute: await load('notices/notices.route'),
    noticesUseCase: await load('notices/list-notices.use-case'),
    noticeView: await load('notices/notice-view'),
    noticeMessages: await load('notices/notice-messages'),
    noticeContent: await load('notices/notice-content'),
    priceAlertRoutes: await load('price-alerts/price-alerts.routes'),
    priceAlertUseCases: await load('price-alerts/price-alert.use-cases'),
    horizonBest: await load('horizons/horizon-best'),
    horizonIntradayRun: await load('horizons/horizon-intraday-run'),
    horizonMessages: await load('horizons/horizon-messages'),
    horizonRoutes: await load('horizons/horizons.routes'),
    horizonView: await load('horizons/horizon-view'),
    horizonCache: await load('horizons/horizon-cache'),
    horizonComputation: await load('horizons/horizon-computation'),
    horizonEvaluation: await load('horizons/horizon-evaluation.use-case'),
    goalPlan: await load('goals/goal-plan.use-case'),
    goalPlanCache: await load('goals/goal-plan-cache'),
    goalCandles: await load('goals/goal-evaluation-candles'),
    goalSeries: await load('goals/goal-evaluation-series'),
    seedExample: await load('strategies/seed-example-strategy.use-case'),
    seedingResolver: await load('strategies/example-seeding-user-resolver'),
    stallPolicy: await load('runs/stall/stall-policy'),
    stallSweeper: await load('runs/stall/stall-sweeper'),
    stallSweepLoop: await load('runs/stall/stall-sweep-loop'),
    stallAlertPayload: await load('runs/stall/stall-alert-payload'),
    meModelTeamsRoutes: await load('model-teams/me-model-teams.routes'),
    meModelTeamsUseCase: await load('model-teams/me-model-teams.use-case'),
    runModelTeamsRoutes: await load('model-teams/run-model-teams.routes'),
    runModelTeamsUseCase: await load('model-teams/run-model-teams.use-case'),
    runModelTeamsComparison: await load('model-teams/run-model-teams-comparison.use-case'),
    modelOpinionRequest: await load('model-teams/model-opinion-request.use-case'),
    modelDuelRoutes: await load('model-teams/model-duels.routes'),
    modelDuelCreate: await load('model-teams/model-duel-create.use-case'),
    modelDuelRead: await load('model-teams/model-duel-read.use-case'),
    providerState: await load('model-teams/provider-state'),
    openApi: await load('openapi/build-openapi-document'),
    undocumentedError: await load('openapi/undocumented-route.error'),
    apiRoutes: await load('routes/create-api-routes'),
    healthDependencies: await load('health/create-health-dependencies'),
    healthView: await load('health/health-view'),
    docsConstant: await load('docs/docs.constant'),
    errorCatalog: await load('shared/errors/error-code-catalog'),
    securityConstant: await load('http/http-security.constant'),
  };
}
