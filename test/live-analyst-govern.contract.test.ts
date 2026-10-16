// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { AnalystDecisionInput } from '../packages/database/src/index.js';
import {
  advanceCandle,
  appendDecisions,
  createBatchBuffer,
  createPositionTracker,
  createSentimentPicker,
  toRunResultRows,
} from '../packages/run-recording/src/index.js';
import {
  canonicalJson,
  COMMAND_KIND,
  COMMAND_REASON,
  createEngine,
  ENGINE_INPUT_ERROR_CODE,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  EngineInputError,
  serializeEngineState,
  toEngineDecimal,
  type Engine,
  type EngineCandle,
  type EngineCommand,
  type EntryRiskScale,
  type StepInput,
  type StepResult,
} from '../packages/strategy-engine/src/index.js';
import {
  appendRows,
  createEmptyResults,
  snapshotResults,
} from './fixtures/backtest/in-memory-backtest-results.fixture.js';
import {
  ANALYST_GOVERN_REQUEST,
  ANALYST_REAL_DATASET,
  ANALYST_REAL_SENTIMENT,
  buildAnalystLive,
} from './fixtures/live/analyst-live.fixture.js';
import type { InMemoryLive } from './fixtures/live/in-memory-live-database.fixture.js';
import { createTestEvaluator, postgresCrash } from './fixtures/live/live-scenarios.fixture.js';
import { buildReferenceRun } from './fixtures/strategy-engine/engine-scenarios.fixture.js';
import { CLASSIC_STRATEGY } from './fixtures/strategy-engine/signal/classic-signals.fixture.js';

// O analista GOVERNA a simulação ao vivo (spec 007, T4.2b, ADR 0002 A21): decide sobre o passo, dá o teto da entrada e a saída
// por tempo, o MESMO candle é refeito com eles e só o refeito é gravado, com a linha da decisão na mesma transação. Toda
// ronda aqui leva UMA vela (`maxStepsPerPass: 1`): com várias, as anteriores à última ronda viram `late_candle` (pausa).

setDefaultTimeout(240_000);

const CANDLE = ENGINE_TIMEFRAME_DURATION_MILLISECONDS['15m'];
const CANDLE_COUNT = 1_400;
const ONE_BY_ONE = 1;
const SCALES: readonly EntryRiskScale[] = ['0', '0.25', '0.5', '1'];
const TOLERANCE = toEngineDecimal('0.00000001');
const MAXIMUM_TICKS = 6_000;
const GOAL_ID = 'goal-govern';
// Com o custo do exemplo (0,1% + 0,05%) o mercado real do recorte é pausa em toda vela (`move_cost`); com taxas mínimas a
// regra libera a cautela de 1/4 e há entrada e saída por tempo para provar.
const CHEAP_SETUP = buildReferenceRun({
  symbol: ANALYST_REAL_DATASET.market.symbol,
  timeframe: ANALYST_REAL_DATASET.market.timeframe,
  feeRate: '0.00001',
  slippageRate: '0.00001',
});
const CHEAP_RUN = {
  runParameters: structuredClone(CHEAP_SETUP.parameters),
  runHash: CHEAP_SETUP.runHash,
};

type Capture = {
  readonly input: StepInput;
  readonly result: StepResult;
  readonly plain: StepResult;
};

// O motor de verdade, espiando cada passo REFEITO com a entrada do analista: ao lado vai o mesmo passo sem a escala.
function createSpyEngine(captures: Capture[]): Engine {
  const real = createEngine();
  return {
    ...real,
    step: (input): StepResult => {
      const result = real.step(input);
      if (input.entryRiskScale !== undefined) {
        captures.push({ input, result, plain: real.step({ ...input, entryRiskScale: undefined }) });
      }
      return result;
    },
  };
}

// Duas rondas seguidas sem passo: uma queda transitória é retentada antes de dar a simulação por parada.
async function tickUntilQuiet(evaluator: {
  readonly tick: () => Promise<{ readonly steps: number }>;
}): Promise<void> {
  let quiet = 0;
  for (let tick = 0; tick < MAXIMUM_TICKS && quiet < 2; tick += 1) {
    quiet = (await evaluator.tick()).steps === 0 ? quiet + 1 : 0;
  }
  if (quiet < 2) throw new Error('o avaliador não ficou ocioso');
}

async function runOneByOne(live: InMemoryLive, engine?: Engine): Promise<void> {
  const { evaluator } = await createTestEvaluator(live, {
    maxStepsPerPass: ONE_BY_ONE,
    ...(engine === undefined ? {} : { engine }),
  });
  await tickUntilQuiet(evaluator);
}

function governLive(candleCount = CANDLE_COUNT, overrides = {}): InMemoryLive {
  return buildAnalystLive({
    withAnalyst: false,
    candleCount,
    overrides: { analyst: ANALYST_GOVERN_REQUEST, ...CHEAP_RUN, ...overrides },
  });
}

function rowsOf(live: InMemoryLive): AnalystDecisionInput[] {
  return [...live.state.analystDecisions.values()].sort(
    (first, second) => first.candleTime - second.candleTime,
  );
}

function readField(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Object.getOwnPropertyDescriptor(value, name)?.value;
}

function entryOrdersOf(result: StepResult): StepResult['decisions']['orders'] {
  return result.decisions.orders.filter(
    (order) => order.purpose === 'entry' && order.createdCandleOpenTime === order.candleOpenTime,
  );
}

const governed = governLive();
const captures: Capture[] = [];
await runOneByOne(governed, createSpyEngine(captures));
const plainLive = buildAnalystLive({
  withAnalyst: false,
  candleCount: CANDLE_COUNT,
  overrides: CHEAP_RUN,
});
await runOneByOne(plainLive);
// O mesmo recorte com o custo do exemplo: a regra pausa em toda vela e a estratégia sozinha entraria.
const realCostCaptures: Capture[] = [];
const realCost = buildAnalystLive({
  withAnalyst: false,
  candleCount: CANDLE_COUNT,
  overrides: { analyst: ANALYST_GOVERN_REQUEST },
});
await runOneByOne(realCost, createSpyEngine(realCostCaptures));

describe('o analista governa: uma linha por vela, em modo govern, com o que o passo recebeu', () => {
  test('uma decisão por vela confirmada, na grade de 15 min, em govern e com a versão da regra', () => {
    const rows = rowsOf(governed);
    expect(rows.length).toBe(governed.state.commits);
    expect(rows.map((row) => row.candleTime)).toStrictEqual(
      ANALYST_REAL_DATASET.candles.slice(0, rows.length).map((candle) => candle.openTime),
    );
    expect(rows.every((row) => row.mode === 'govern' && row.version === 'analyst-1')).toBe(true);
    expect(rows.every((row) => row.status === 'decided')).toBe(true);
  });

  test('o tamanho gravado é a escala efetiva: porta fechada = 0, e nunca acima de 1', () => {
    for (const row of rowsOf(governed)) {
      expect(SCALES).toContain(row.riskScale as EntryRiskScale);
      if (row.entryGate === 'closed') expect(row.riskScale).toBe('0');
      if (row.posture === 'pause') expect(row.riskScale).toBe('0');
    }
  });

  test('o único comando do analista é a saída por tempo, e o que se grava são os comandos ENVIADOS', () => {
    const kinds = new Set<string>();
    for (const row of rowsOf(governed)) {
      const commands = Array.isArray(row.commands) ? row.commands : [];
      for (const command of commands) kinds.add(String(readField(command, 'kind')));
    }
    expect([...kinds].every((kind) => kind === 'exit_position')).toBe(true);
    const applied = [...governed.state.results.commands.values()].map((command) => command.reason);
    expect(applied.every((reason) => reason === 'analyst_timeout')).toBe(true);
  });
});

describe('invariância: o histórico gravado é o do resultado FINAL', () => {
  test('refazer a simulação do zero com a escala e os comandos GRAVADOS dá as mesmas linhas e o mesmo estado do motor', () => {
    const rows = new Map(rowsOf(governed).map((row) => [row.candleTime, row]));
    const candles = ANALYST_REAL_DATASET.candles.slice(0, governed.state.commits);
    const setup = CHEAP_SETUP;
    const engine = createEngine();
    const pickSentiment = createSentimentPicker({
      observations: ANALYST_REAL_SENTIMENT,
      source: setup.parameters.sentimentSource,
    });
    const buffer = createBatchBuffer();
    const tracker = createPositionTracker(null);
    let state = engine.createInitialState({ strategy: CLASSIC_STRATEGY, run: setup });
    let previousOpenTime: number | null = null;
    for (const candle of candles) {
      const row = rows.get(candle.openTime);
      const advanced = advanceCandle({
        engine,
        strategy: CLASSIC_STRATEGY,
        setup,
        state,
        candle,
        previousOpenTime,
        durationMilliseconds: CANDLE,
        pickSentiment,
        commands: commandsOf(row, candle),
        entryRiskScale: scaleOf(row),
      });
      appendDecisions({ buffer, decisions: advanced.result.decisions, tracker });
      state = advanced.result.state;
      previousOpenTime = candle.openTime;
    }
    const stage = createEmptyResults();
    appendRows(stage, toRunResultRows(buffer));
    expect(JSON.stringify(snapshotResults(stage))).toBe(JSON.stringify(governed.snapshot()));
    expect(serializeEngineState(state)).toBe(
      canonicalJson(governed.state.checkpoint?.engineState ?? null),
    );
  });
});

function scaleOf(row: AnalystDecisionInput | undefined): EntryRiskScale {
  return SCALES.find((scale) => scale === row?.riskScale) ?? '0';
}

function commandsOf(
  row: AnalystDecisionInput | undefined,
  candle: EngineCandle,
): readonly EngineCommand[] {
  const stored = Array.isArray(row?.commands) ? row.commands : [];
  return stored.map((command) => ({
    commandId: String(readField(command, 'commandId')),
    issuedAt: candle.closeTime,
    kind: COMMAND_KIND.EXIT_POSITION,
    reason: COMMAND_REASON.ANALYST_TIMEOUT,
  }));
}

describe('pausa e tamanho: barram a entrada nova, nunca a saída', () => {
  test('há passos refeitos com a escala (o motor recebeu a entrada do analista)', () => {
    expect(captures.length).toBeGreaterThan(100);
  });

  test('a SAÍDA nunca muda: preenchimentos, posições abertas e fechadas e patrimônio iguais ao passo sem a escala', () => {
    for (const { result, plain } of [...captures, ...realCostCaptures]) {
      expect(result.decisions.fills).toStrictEqual(plain.decisions.fills);
      expect(result.decisions.openedPositions).toStrictEqual(plain.decisions.openedPositions);
      expect(result.decisions.closedPositions).toStrictEqual(plain.decisions.closedPositions);
      expect(result.decisions.equityPoint).toStrictEqual(plain.decisions.equityPoint);
    }
  });

  test('escala 0 não coloca nenhuma entrada, e houve vela em que a estratégia entraria', () => {
    const paused = [...captures, ...realCostCaptures].filter(
      ({ input }) => input.entryRiskScale === '0',
    );
    expect(paused.length).toBeGreaterThan(0);
    for (const { result } of paused) expect(entryOrdersOf(result)).toStrictEqual([]);
    expect(paused.some(({ plain }) => entryOrdersOf(plain).length > 0)).toBe(true);
  });

  test('tamanho 1/4 e 1/2: o valor em risco da entrada é no máximo a escala do que a estratégia arriscaria', () => {
    const reduced = captures.filter(
      ({ input, plain }) =>
        (input.entryRiskScale === '0.25' || input.entryRiskScale === '0.5') &&
        entryOrdersOf(plain).length > 0,
    );
    expect(reduced.length).toBeGreaterThan(0);
    for (const { input, result, plain } of reduced) {
      const scale = toEngineDecimal(input.entryRiskScale ?? '1');
      const scaled = entryOrdersOf(result)[0]?.riskAmount ?? '0';
      const full = entryOrdersOf(plain)[0]?.riskAmount ?? '0';
      expect(toEngineDecimal(scaled).lte(scale.times(full).plus(TOLERANCE))).toBe(true);
      expect(toEngineDecimal(scaled).gt(0)).toBe(true);
    }
  });
});

describe('a pausa nunca barra a saída', () => {
  test('com o custo do exemplo a regra pausa em toda vela e a simulação não faz ordem alguma', () => {
    const rows = rowsOf(realCost);
    expect(rows.length).toBe(realCost.state.commits);
    expect(rows.every((row) => row.riskScale === '0' && row.entryGate === 'closed')).toBe(true);
    expect(realCost.snapshot()['orders'] ?? []).toStrictEqual([]);
  });

  test('venda por sinal, stop e alvo acontecem com a escala do analista e o passo de saída é o mesmo sem ela (recorte inteiro)', async () => {
    const long = governLive(ANALYST_REAL_DATASET.candles.length);
    const longCaptures: Capture[] = [];
    await runOneByOne(long, createSpyEngine(longCaptures));
    const reasons = new Set(
      [...long.state.results.positions.values()].map((position) => position.exitReason),
    );
    for (const reason of ['stop', 'target', 'signal', 'command']) {
      expect(reasons.has(reason as 'stop')).toBe(true);
    }
    for (const { result, plain } of longCaptures) {
      expect(result.decisions.fills).toStrictEqual(plain.decisions.fills);
      expect(result.decisions.closedPositions).toStrictEqual(plain.decisions.closedPositions);
    }
    const pausedTimes = new Set(
      rowsOf(long)
        .filter((row) => row.riskScale === '0')
        .map((row) => row.candleTime),
    );
    const exitsInPause = [...long.state.results.positions.values()].filter((position) =>
      pausedTimes.has(position.closedCandleTime ?? 0),
    );
    expect(exitsInPause.length).toBeGreaterThan(0);
  });
});

describe('saída por tempo: a posição sai na 5ª vela', () => {
  test('toda posição fechada por comando (a saída por tempo) ficou aberta exatamente 4 velas e o comando foi gravado', () => {
    const timed = [...governed.state.results.positions.values()].filter(
      (position) => position.exitReason === 'command',
    );
    const commands = [...governed.state.results.commands.values()];
    expect(timed.length).toBeGreaterThan(0);
    for (const position of timed) {
      expect((position.closedCandleTime ?? 0) - position.openedCandleTime).toBe(4 * CANDLE);
      const command = commands.find(
        (item) => item.candleTime === (position.closedCandleTime ?? 0) - CANDLE,
      );
      expect(command?.reason).toBe('analyst_timeout');
      expect(command?.kind).toBe('exit_position');
    }
  });
});

describe('falha segura', () => {
  test('histórico ilegível em toda ronda: linha de falha, nenhuma entrada, o passo segue e o texto do erro não vaza', async () => {
    const live = governLive(CANDLE_COUNT, {
      hooks: {
        analystHistoryError: () => new Error('postgres://usuario:segredo-do-driver@host/banco'),
      },
    });
    await runOneByOne(live);
    const rows = rowsOf(live);
    expect(rows.length).toBe(live.state.commits);
    expect(rows.every((row) => row.status === 'failed' && row.mode === 'govern')).toBe(true);
    expect(rows.every((row) => row.failureCode === 'ANALYST_SERIES_UNAVAILABLE')).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('segredo');
    expect((plainLive.snapshot()['orders'] ?? []).length).toBeGreaterThan(0);
    expect(live.snapshot()['orders'] ?? []).toStrictEqual([]);
    expect(live.snapshot()['fills'] ?? []).toStrictEqual([]);
    expect(live.state.status).toBe('running');
  });

  test('versão desconhecida com governar NÃO roda sem governo: escala 0 em toda vela, sem ler o histórico', async () => {
    const live = governLive(CANDLE_COUNT, { analyst: { version: 'analyst-9', mode: 'govern' } });
    await runOneByOne(live);
    const rows = rowsOf(live);
    expect(rows.length).toBe(live.state.commits);
    expect(
      rows.every(
        (row) =>
          row.status === 'failed' &&
          row.mode === 'govern' &&
          row.failureCode === 'ANALYST_REQUEST_UNSUPPORTED',
      ),
    ).toBe(true);
    expect(live.snapshot()['orders'] ?? []).toStrictEqual([]);
    expect(live.calls.readAnalystHistory).toBe(0);
  });

  test('o motor recusar a entrada do analista refaz SÓ com a escala 0 (nunca sem analista) e grava o código', async () => {
    const real = createEngine();
    const refusing: Engine = {
      ...real,
      step: (input): StepResult => {
        if (input.entryRiskScale !== undefined && input.entryRiskScale !== '0') {
          throw new EngineInputError({
            code: ENGINE_INPUT_ERROR_CODE.ENTRY_RISK_SCALE_INVALID,
            message: 'recusada',
          });
        }
        return real.step(input);
      },
    };
    const live = governLive(CANDLE_COUNT);
    await runOneByOne(live, refusing);
    const rows = rowsOf(live);
    const refused = rows.filter((row) => row.failureCode?.startsWith('ANALYST_ENGINE_REFUSED:'));
    expect(refused.length).toBeGreaterThan(0);
    expect(refused.every((row) => row.status === 'failed' && row.mode === 'govern')).toBe(true);
    expect(refused[0]?.failureCode).toBe('ANALYST_ENGINE_REFUSED:ENTRY_RISK_SCALE_INVALID');
    const refusedTimes = new Set(refused.map((row) => row.candleTime));
    const entries = [...live.state.results.orders.values()].filter(
      (order) => order.purpose === 'entry' && refusedTimes.has(order.createdCandleTime),
    );
    expect(entries).toStrictEqual([]);
    expect(live.state.status).toBe('running');
  });
});

describe('erro que não é recusa do motor', () => {
  test('um erro qualquer do passo refeito NÃO é engolido como recusa: o passo não é gravado e nenhuma linha de recusa nasce', async () => {
    const real = createEngine();
    const failing: Engine = {
      ...real,
      step: (input): StepResult => {
        if (input.entryRiskScale !== undefined && input.entryRiskScale !== '0') {
          throw new Error('defeito inesperado do motor');
        }
        return real.step(input);
      },
    };
    const live = governLive(CANDLE_COUNT);
    await runOneByOne(live, failing);
    expect(live.state.commits).toBeLessThan(CANDLE_COUNT);
    expect(rowsOf(live).some((row) => row.failureCode?.startsWith('ANALYST_ENGINE_REFUSED'))).toBe(
      false,
    );
  });
});

describe('meta e analista', () => {
  const spec = { targetRate: '5', maxLossRate: '0.99', horizonDays: 7 };

  test('decidida a meta, o analista não manda comando e o desfecho é o mesmo de sem analista', async () => {
    const withGoal = governLive(CANDLE_COUNT, { goal: { goalId: GOAL_ID, spec } });
    const goalOnly = buildAnalystLive({
      withAnalyst: false,
      candleCount: CANDLE_COUNT,
      overrides: { ...CHEAP_RUN, goal: { goalId: GOAL_ID, spec } },
    });
    await runOneByOne(withGoal);
    await runOneByOne(goalOnly);
    const outcome = withGoal.state.goalOutcome;
    expect(withGoal.state.status).toBe('completed');
    expect(outcome?.outcome).toBe('goal_expired');
    expect(outcome?.candleTime).toBe(goalOnly.state.goalOutcome?.candleTime);
    const after = rowsOf(withGoal).filter((row) => row.candleTime >= (outcome?.candleTime ?? 0));
    for (const row of after) expect(row.commands ?? []).toStrictEqual([]);
    const analystCommands = [...withGoal.state.results.commands.values()].filter(
      (command) =>
        command.reason === 'analyst_timeout' && command.candleTime >= (outcome?.candleTime ?? 0),
    );
    expect(analystCommands).toStrictEqual([]);
    const lateEntries = [...withGoal.state.results.orders.values()].filter(
      (order) => order.purpose === 'entry' && order.createdCandleTime > (outcome?.candleTime ?? 0),
    );
    expect(lateEntries).toStrictEqual([]);
  });
});

describe('queda e retomada', () => {
  test('queda no meio da transação desfaz passo E decisão; outra instância retoma com as MESMAS decisões da execução contínua', async () => {
    const candleCount = 700;
    const continuous = governLive(candleCount);
    await runOneByOne(continuous);
    let isSpent = false;
    const crashed = governLive(candleCount, {
      hooks: {
        afterAppend: (commit: number) => {
          if (commit !== 400 || isSpent) return;
          isSpent = true;
          throw postgresCrash();
        },
      },
    });
    const first = await createTestEvaluator(crashed, {
      instanceId: 'worker-a',
      maxStepsPerPass: ONE_BY_ONE,
    });
    for (let tick = 0; tick < 405; tick += 1) await first.evaluator.tick();
    expect(isSpent).toBe(true);
    crashed.state.isHeartbeatExpired = true;
    const second = await createTestEvaluator(crashed, {
      instanceId: 'worker-b',
      maxStepsPerPass: ONE_BY_ONE,
    });
    await tickUntilQuiet(second.evaluator);
    expect(crashed.state.analystDecisions.size).toBe(crashed.state.commits);
    const withoutRun = (live: InMemoryLive): string =>
      JSON.stringify(rowsOf(live).map((row) => ({ ...row, runId: '' })));
    expect(withoutRun(crashed)).toBe(withoutRun(continuous));
    expect(JSON.stringify(crashed.snapshot())).toBe(JSON.stringify(continuous.snapshot()));
  });
});

describe('sem governar nada muda', () => {
  test('a simulação sem analista não tem linha de decisão e o pedido de sombra segue observando', () => {
    expect(plainLive.state.analystDecisions.size).toBe(0);
  });
});
