// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createAnalystRunHistory } from '../../apps/worker-ativada/src/live/analyst-run-history.js';
import {
  createAnalystSeriesCache,
  type AnalystSeriesCache,
} from '../../apps/worker-ativada/src/live/analyst-series-cache.js';
import { decideShadowStep } from '../../apps/worker-ativada/src/live/analyst-step.js';
import type { AnalystRunKit } from '../../apps/worker-ativada/src/live/load-analyst-context.js';
import { ANALYST_COMMAND_REASON } from '../../packages/risk-analyst/src/index.js';
import { advanceCandle } from '../../packages/run-recording/src/index.js';
import {
  COMMAND_KIND,
  COMMAND_REASON,
  createEngine,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  formatEngineDecimal,
  toEngineDecimal,
  type CommandKind,
  type CommandReason,
  type EngineCandle,
  type EngineCommand,
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

// Nada aqui grava: o passo é o `advanceCandle` do produto sobre a série em memória, como a linha de 15 min da spec 003.
// O motor ainda não tem motivo de comando do analista (Fase 4, que muda o motor e a tabela `run_commands`): como nada é
// gravado, o comando do analista entra com um motivo que o motor já conhece; o efeito na carteira é o mesmo.
const ENGINE_REASON_OF: Readonly<Record<CommandKind, CommandReason>> = {
  [COMMAND_KIND.HALT]: COMMAND_REASON.USER_STOP,
  [COMMAND_KIND.RESUME]: COMMAND_REASON.USER_RESUME,
  [COMMAND_KIND.EXIT_POSITION]: COMMAND_REASON.WINDOW_END,
};
const ENGINE_KINDS: readonly string[] = Object.values(COMMAND_KIND);

export type SimulationParams = {
  readonly strategy: StrategyVersion;
  readonly setup: RunSetup;
  readonly pair: PairData;
  // A primeira vela passada ao motor: o início do período menos o aquecimento da estratégia.
  readonly firstIndex: number;
  readonly withAnalyst: boolean;
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

function readProperty(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Object.getOwnPropertyDescriptor(value, name)?.value;
}

function isEngineKind(kind: string): kind is CommandKind {
  return ENGINE_KINDS.includes(kind);
}

// Os comandos que a decisão gravaria (`commands` do registro), como o motor os entende; fecham no fechamento da vela.
function toEngineCommands(commands: unknown, candle: EngineCandle): EngineCommand[] {
  if (!Array.isArray(commands)) return [];
  return commands.flatMap((item: unknown) => {
    const kind = readProperty(item, 'kind');
    const commandId = readProperty(item, 'commandId');
    if (typeof kind !== 'string' || typeof commandId !== 'string' || !isEngineKind(kind)) return [];
    return [{ commandId, issuedAt: candle.closeTime, kind, reason: ENGINE_REASON_OF[kind] }];
  });
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
  readonly decide: (candle: EngineCandle, result: StepResult) => Promise<EngineCommand[]>;
  readonly tally: MutableTally;
};

// O analista do worker (a mesma série por âncora, o mesmo `decideShadowStep`) governando uma carteira em memória: a porta
// que ele fecha é a que ele reabre, e a de meta ou do usuário nunca é desfeita (aqui só há a dele).
function createAnalystDriver(params: SimulationParams, cache: AnalystSeriesCache): AnalystDriver {
  const tally = createTally();
  const findCandles = createCandleSource(params.pair.candles);
  const history = createAnalystRunHistory({
    readAnalystHistory: () => Promise.resolve({ scores: [], equities: [], positions: [] }),
  });
  let ownsHalt = false;
  let isHalted = false;
  const base: AnalystRunKit = {
    runId: 'counterfactual',
    market: params.pair.market,
    seriesCache: cache,
    source: { findCandles, observations: params.pair.observations, lastOpenTime: 0 },
    history,
    goal: null,
    waiting: { isPending: false },
    haltReason: () => (ownsHalt && isHalted ? ANALYST_COMMAND_REASON.PAUSE : null),
  };
  return {
    tally,
    decide: async (candle, result): Promise<EngineCommand[]> => {
      isHalted = result.state.wallet.isHalted;
      const kit: AnalystRunKit = {
        ...base,
        source: { ...base.source, lastOpenTime: candle.openTime },
      };
      const record = await decideShadowStep(kit, {
        context: { setup: params.setup, strategy: params.strategy },
        candle,
        result,
      });
      tally.decisions += 1;
      if (record.status !== 'decided') {
        tally.failed += 1;
        return [];
      }
      bump(tally.postures, record.posture ?? 'unknown');
      bump(tally.reasons, record.reason ?? 'unknown');
      if (record.entryGate === 'closed') tally.gateClosed += 1;
      const commands = toEngineCommands(record.commands, candle);
      for (const command of commands) {
        bump(tally.commands, command.kind);
        if (command.kind === COMMAND_KIND.HALT) ownsHalt = true;
        if (command.kind === COMMAND_KIND.RESUME) ownsHalt = false;
      }
      return commands;
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
    const step = (commands?: readonly EngineCommand[]): StepResult =>
      advanceCandle({
        engine,
        strategy,
        setup,
        state,
        candle,
        previousOpenTime,
        durationMilliseconds,
        pickSentiment: () => undefined,
        commands,
      }).result;
    let result = step();
    const commands = (await driver?.decide(candle, result)) ?? [];
    if (commands.length > 0) result = step(commands);
    recorder.add(result);
    state = result.state;
    previousOpenTime = candle.openTime;
  }
  return { outcome: recorder.outcome(), tally: driver?.tally ?? createTally() };
}
