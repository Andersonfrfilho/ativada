// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  GapConfirmation,
  LiveEvaluator,
  LiveRunClaims,
  LiveRunDatabase,
  LiveTickSummary,
} from '../../../apps/worker-cryptoada/src/live/live-run.types.js';
import type { WorkerLogger } from '../../../apps/worker-cryptoada/src/logging/worker-logger.js';
import {
  advanceCandle,
  appendDecisions,
  createBatchBuffer,
  createPositionTracker,
  createSentimentPicker,
  toRunResultRows,
} from '../../../packages/run-recording/src/index.js';
import {
  computeStrategyLeadInCandles,
  createEngine,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  serializeEngineState,
  type EngineCandle,
  type RunSetup,
  type StoredSentimentObservation,
  type StrategyVersion,
} from '../../../packages/strategy-engine/src/index.js';
import {
  appendRows,
  createEmptyResults,
  snapshotResults,
} from '../backtest/in-memory-backtest-results.fixture.js';
import { buildClassicScenario } from '../strategy-engine/production/engine-golden.fixture.js';
import {
  CLASSIC_STRATEGY,
  type RealDataset,
} from '../strategy-engine/signal/classic-signals.fixture.js';
import { loadLiveApi } from './live-api.fixture.js';
import {
  createInMemoryLive,
  type InMemoryLive,
  type LiveScenario,
} from './in-memory-live-database.fixture.js';

export const LEAD_IN_CANDLES = computeStrategyLeadInCandles(CLASSIC_STRATEGY.config);
const MAXIMUM_TICKS = 400;

export type LogEntry = { readonly level: string; readonly message: string };

export type TestLogger = WorkerLogger & { readonly entries: LogEntry[] };

export function createTestLogger(): TestLogger {
  const entries: LogEntry[] = [];
  const write =
    (level: string) =>
    (message: string): void =>
      void entries.push({ level, message });
  return { entries, info: write('info'), warn: write('warn'), error: write('error') };
}

export function classicSetup(dataset: RealDataset): RunSetup {
  return buildClassicScenario(dataset).run;
}

export type LiveBuild = {
  readonly dataset: RealDataset;
  readonly candles?: readonly EngineCandle[];
  readonly overrides?: Partial<Omit<LiveScenario, 'candles'>>;
};

// O período do dourado: começa no candle que vem DEPOIS do pré-aquecimento; as velas anteriores são o aquecimento.
export function buildLive(build: LiveBuild): InMemoryLive {
  const candles = build.candles ?? build.dataset.candles;
  const setup = classicSetup(build.dataset);
  const first = build.dataset.candles[LEAD_IN_CANDLES];
  return createInMemoryLive({
    candles,
    periodStart: first?.openTime ?? Number.MAX_SAFE_INTEGER,
    runParameters: structuredClone(setup.parameters),
    runHash: setup.runHash,
    ...build.overrides,
  });
}

export type TestEvaluatorOptions = {
  readonly instanceId?: string;
  readonly isGapConfirmed?: GapConfirmation;
  readonly maxStepsPerPass?: number;
  readonly logger?: TestLogger;
};

export async function createTestEvaluator(
  source: { readonly database: LiveRunDatabase; readonly claims: LiveRunClaims },
  options: TestEvaluatorOptions = {},
): Promise<{ readonly evaluator: LiveEvaluator; readonly logger: TestLogger }> {
  const { createLiveEvaluator } = await loadLiveApi();
  const logger = options.logger ?? createTestLogger();
  const evaluator = createLiveEvaluator({
    claims: source.claims,
    database: source.database,
    instanceId: options.instanceId ?? 'worker-test',
    heartbeatTimeoutSeconds: 60,
    isGapConfirmed: options.isGapConfirmed ?? ((): boolean => false),
    logger,
    ...(options.maxStepsPerPass === undefined ? {} : { maxStepsPerPass: options.maxStepsPerPass }),
  });
  return { evaluator, logger };
}

export type TickTotals = LiveTickSummary & { readonly ticks: number };

// Rondas até uma sem nenhum passo novo (ou até o teto, que reprova o teste).
export async function tickUntilIdle(evaluator: LiveEvaluator): Promise<TickTotals> {
  const totals = { claimed: 0, evaluated: 0, steps: 0, ended: 0, failed: 0, ticks: 0 };
  for (let tick = 0; tick < MAXIMUM_TICKS; tick += 1) {
    const summary = await evaluator.tick();
    totals.claimed += summary.claimed;
    totals.evaluated += summary.evaluated;
    totals.steps += summary.steps;
    totals.ended += summary.ended;
    totals.failed += summary.failed;
    totals.ticks += 1;
    if (summary.steps === 0) return totals;
  }
  throw new Error('o avaliador não ficou ocioso');
}

export type ReferenceRun = {
  readonly rows: Record<string, readonly unknown[]>;
  readonly engineState: string;
  readonly lastCandleTime: number;
  readonly gapCandles: number;
};

export type ReferenceParams = {
  readonly strategy?: StrategyVersion;
  readonly setup: RunSetup;
  readonly candles: readonly EngineCandle[];
  readonly observations?: readonly StoredSentimentObservation[];
};

// O mesmo passo de produção (`advanceCandle`) num laço direto, sem banco: o que um backtest contínuo deixaria.
export function runReference(params: ReferenceParams): ReferenceRun {
  const strategy = params.strategy ?? CLASSIC_STRATEGY;
  const engine = createEngine();
  const { setup } = params;
  let state = engine.createInitialState({ strategy, run: setup });
  const buffer = createBatchBuffer();
  const tracker = createPositionTracker(null);
  const pickSentiment = createSentimentPicker({
    observations: params.observations ?? [],
    source: setup.parameters.sentimentSource,
  });
  let previousOpenTime: number | null = null;
  let gapCandles = 0;
  for (const candle of params.candles) {
    const advanced = advanceCandle({
      engine,
      strategy,
      setup,
      state,
      candle,
      previousOpenTime,
      durationMilliseconds: ENGINE_TIMEFRAME_DURATION_MILLISECONDS[setup.parameters.timeframe],
      pickSentiment,
    });
    appendDecisions({ buffer, decisions: advanced.result.decisions, tracker });
    state = advanced.result.state;
    previousOpenTime = candle.openTime;
    gapCandles += advanced.gapCandles;
  }
  const stage = createEmptyResults();
  appendRows(stage, toRunResultRows(buffer));
  return {
    rows: snapshotResults(stage),
    engineState: serializeEngineState(state),
    lastCandleTime: previousOpenTime ?? 0,
    gapCandles,
  };
}

export function withoutCandles(
  candles: readonly EngineCandle[],
  params: { readonly from: number; readonly count: number },
): EngineCandle[] {
  return candles.filter(
    (_candle, index) => index < params.from || index >= params.from + params.count,
  );
}

export function postgresCrash(): Error {
  return Object.assign(new Error('conexão perdida'), { code: '08006' });
}

export function foreignKeyViolation(): Error {
  return Object.assign(new Error('violação de chave estrangeira'), { code: '23503' });
}
