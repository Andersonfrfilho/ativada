// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createAnalystRunHistory } from '../../apps/worker-ativada/src/live/analyst-run-history.js';
import {
  createAnalystSeriesCache,
  type AnalystSeriesCache,
} from '../../apps/worker-ativada/src/live/analyst-series-cache.js';
import {
  analyzeStep,
  type AnalystVerdict,
} from '../../apps/worker-ativada/src/live/analyst-step.js';
import type { AnalystRunKit } from '../../apps/worker-ativada/src/live/load-analyst-context.js';
import { toGovernInputs, type GovernInputs } from '../../packages/risk-analyst/src/index.js';
import { advanceCandle } from '../../packages/run-recording/src/index.js';
import {
  createEngine,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  ENTRY_RISK_SCALE,
  formatEngineDecimal,
  toEngineDecimal,
  type EngineCandle,
  type EngineState,
  type RunSetup,
  type StepResult,
  type StrategyVersion,
} from '../../packages/strategy-engine/src/index.js';
import type {
  AnalystTally,
  EquityRecord,
  PairData,
  SimulationOutcome,
} from './counterfactual.types.js';

// Nada aqui grava: o passo é o `advanceCandle` do produto sobre a série em memória, como a linha de 15 min da spec 003. O analista
// GOVERNA como no worker (ADR 0002 A21): decide sobre o passo feito, `toGovernInputs` (a mesma função do worker) o traduz em
// teto de entrada e saída por tempo, e o candle é refeito com eles.

export type SimulationParams = {
  readonly strategy: StrategyVersion;
  readonly setup: RunSetup;
  readonly pair: PairData;
  // A primeira vela passada ao motor: o início do período menos o aquecimento da estratégia.
  readonly firstIndex: number;
  readonly withAnalyst: boolean;
  // Recebe o resultado FINAL de cada passo (a paridade com o ao vivo grava as linhas dele).
  readonly onStep?: (result: StepResult) => void;
};

export type SimulationRun = { readonly outcome: SimulationOutcome; readonly tally: AnalystTally };

type MutableTally = {
  decisions: number;
  failed: number;
  gateClosed: number;
  postures: Record<string, number>;
  reasons: Record<string, number>;
  commands: Record<string, number>;
};

function createTally(): MutableTally {
  return { decisions: 0, failed: 0, gateClosed: 0, postures: {}, reasons: {}, commands: {} };
}

function bump(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

type CandleWindow = { readonly from: number; readonly to: number; readonly limit: number };

function createCandleSource(
  candles: readonly EngineCandle[],
): (window: CandleWindow) => Promise<readonly EngineCandle[]> {
  return (window): Promise<readonly EngineCandle[]> => {
    let low = 0;
    let high = candles.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((candles[middle]?.openTime ?? Number.POSITIVE_INFINITY) < window.from) low = middle + 1;
      else high = middle;
    }
    const found: EngineCandle[] = [];
    for (let index = low; index < candles.length && found.length < window.limit; index += 1) {
      const candle = candles[index];
      if (candle === undefined || candle.openTime >= window.to) break;
      found.push(candle);
    }
    return Promise.resolve(found);
  };
}

type AnalystDriver = {
  readonly decide: (candle: EngineCandle, result: StepResult) => Promise<GovernInputs>;
  // O histórico da própria simulação guarda o resultado FINAL do passo, como no worker.
  readonly record: (candle: EngineCandle, result: StepResult) => void;
  readonly tally: MutableTally;
};

function tallyDecision(tally: MutableTally, verdict: AnalystVerdict, inputs: GovernInputs): void {
  tally.decisions += 1;
  if ('failureCode' in verdict) {
    tally.failed += 1;
    return;
  }
  const { decision } = verdict;
  bump(tally.postures, decision.posture);
  bump(tally.reasons, decision.reason);
  if (decision.entryGate === 'closed') tally.gateClosed += 1;
  for (const command of inputs.commands) bump(tally.commands, command.kind);
}

// O analista do worker (a mesma série por âncora, o mesmo `analyzeStep`) governando uma carteira em memória.
function createAnalystDriver(params: SimulationParams, cache: AnalystSeriesCache): AnalystDriver {
  const tally = createTally();
  const history = createAnalystRunHistory({
    readAnalystHistory: () => Promise.resolve({ scores: [], equities: [], positions: [] }),
  });
  const base: AnalystRunKit = {
    runId: 'counterfactual',
    mode: 'govern',
    isSupported: true,
    market: params.pair.market,
    seriesCache: cache,
    source: {
      findCandles: createCandleSource(params.pair.candles),
      observations: params.pair.observations,
      lastOpenTime: 0,
    },
    history,
    goal: null,
    waiting: { isPending: false },
    haltReason: () => null,
  };
  return {
    tally,
    record: (candle, result): void => history.record(candle, result.decisions),
    decide: async (candle, result): Promise<GovernInputs> => {
      const kit: AnalystRunKit = {
        ...base,
        source: { ...base.source, lastOpenTime: candle.openTime },
      };
      const context = { setup: params.setup, strategy: params.strategy };
      const verdict = await analyzeStep(kit, { context, candle, result });
      const inputs = toGovernInputs({
        decision: 'decision' in verdict ? verdict.decision : undefined,
        wallet: { hasPosition: result.state.wallet.position !== null },
        candle,
        isGoalEnded: false,
      });
      tallyDecision(tally, verdict, inputs);
      return inputs;
    },
  };
}

type Recorder = {
  readonly add: (result: StepResult) => void;
  readonly outcome: () => SimulationOutcome;
};

function createRecorder(): Recorder {
  const equity: EquityRecord[] = [];
  let fees = toEngineDecimal('0');
  let entries = 0;
  let closed = 0;
  let peak = toEngineDecimal('0');
  let maxDrawdown = toEngineDecimal('0');
  return {
    add: (result): void => {
      const { decisions } = result;
      for (const fill of decisions.fills) fees = fees.plus(fill.fee);
      entries += decisions.openedPositions.length;
      closed += decisions.closedPositions.length;
      const point = decisions.equityPoint;
      if (point === null) return;
      equity.push({
        candleTime: point.candleOpenTime,
        equity: point.equity,
        equityAtLow: point.equityAtLow,
      });
      const value = toEngineDecimal(point.equity);
      if (value.gt(peak)) peak = value;
      const drawdown = peak.minus(point.equityAtLow).dividedBy(peak);
      if (drawdown.gt(maxDrawdown)) maxDrawdown = drawdown;
    },
    outcome: () => ({
      equity,
      entries,
      closedPositions: closed,
      feesPaid: formatEngineDecimal(fees),
      finalEquity: equity.at(-1)?.equity ?? '0',
      maxDrawdownAtLow: formatEngineDecimal(maxDrawdown),
    }),
  };
}

function isNeutral(inputs: GovernInputs): boolean {
  return inputs.commands.length === 0 && inputs.entryRiskScale === ENTRY_RISK_SCALE.FULL;
}

export async function simulate(
  params: SimulationParams,
  cache: AnalystSeriesCache = createAnalystSeriesCache(),
): Promise<SimulationRun> {
  const { strategy, setup, pair } = params;
  const engine = createEngine();
  const durationMilliseconds = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[setup.parameters.timeframe];
  const driver = params.withAnalyst ? createAnalystDriver(params, cache) : undefined;
  const recorder = createRecorder();
  let state: EngineState = engine.createInitialState({ strategy, run: setup });
  let previousOpenTime: number | null = null;
  for (let index = params.firstIndex; index < pair.candles.length; index += 1) {
    const candle = pair.candles[index];
    if (candle === undefined) break;
    const step = (inputs?: GovernInputs): StepResult =>
      advanceCandle({
        engine,
        strategy,
        setup,
        state,
        candle,
        previousOpenTime,
        durationMilliseconds,
        pickSentiment: () => undefined,
        commands: inputs?.commands,
        entryRiskScale: inputs?.entryRiskScale,
      }).result;
    let result = step();
    const inputs = await driver?.decide(candle, result);
    if (inputs !== undefined && !isNeutral(inputs)) result = step(inputs);
    driver?.record(candle, result);
    recorder.add(result);
    params.onStep?.(result);
    state = result.state;
    previousOpenTime = candle.openTime;
  }
  return { outcome: recorder.outcome(), tally: driver?.tally ?? createTally() };
}
