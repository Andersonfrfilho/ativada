// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, setDefaultTimeout, test } from 'bun:test';

import {
  ANALYST_RULES,
  auditVotes,
  CANDLE_MILLISECONDS,
  computeSeriesAnchor,
  decideAnalyst,
  FAILURE_MESSAGE,
  runSpecialistTeam,
  selectSentiments,
  type AnalystInput,
  type AnalystPosition,
  type VoteReading,
} from '../packages/risk-analyst/src/index.js';
import type { AnalystDecisionInput } from '../packages/database/src/index.js';
import {
  ANALYST_DECISION_MODE,
  ANALYST_DECISION_STATUS,
} from '../packages/database/src/analyst/analyst-decision.constant.js';
import {
  ANALYST_RECORD_MODE,
  ANALYST_RECORD_STATUS,
} from '../apps/worker-ativada/src/live/analyst-live.constant.js';
import { canonicalJson } from '../packages/strategy-engine/src/index.js';
import {
  ANALYST_REAL_DATASET,
  ANALYST_REAL_SENTIMENT,
  ANALYST_SHADOW_REQUEST,
  buildAnalystLive,
} from './fixtures/live/analyst-live.fixture.js';
import { loadAnalystLiveParts } from './fixtures/live/live-api.fixture.js';
import type { InMemoryLive } from './fixtures/live/in-memory-live-database.fixture.js';
import { combineLives } from './fixtures/live/in-memory-live-database.fixture.js';
import {
  buildLive,
  classicSetup,
  createTestEvaluator,
  postgresCrash,
  tickUntilIdle,
} from './fixtures/live/live-scenarios.fixture.js';
import {
  CLASSIC_STRATEGY,
  REAL_DATASETS,
} from './fixtures/strategy-engine/signal/classic-signals.fixture.js';

// O analista em SOMBRA no passo ao vivo (spec 007, T2.3, A18): a decisão entra na MESMA transação do passo, a falha dela
// grava só o código e o passo segue, e a simulação com e sem sombra é a mesma, linha a linha.

// Cada percurso roda centenas de passos com a série de 30 dias: passa dos 5 s padrão do `bun test`.
setDefaultTimeout(120_000);

const parts = await loadAnalystLiveParts();
const STEP_BY_STEP = 1;
const LONG_PASS = 250;
const MAXIMUM_TICKS = 3_000;
const DAILY_WINDOW_MILLISECONDS = ANALYST_RULES.lossWindowCandles * CANDLE_MILLISECONDS;

async function runToIdle(live: InMemoryLive, maxStepsPerPass?: number): Promise<void> {
  const { evaluator } = await createTestEvaluator(
    live,
    maxStepsPerPass === undefined ? {} : { maxStepsPerPass },
  );
  await tickUntilQuiet(evaluator);
}

// Duas rondas seguidas sem passo: uma queda transitória (ronda sem passo) é retentada antes de dar a simulação por parada.
async function tickUntilQuiet(evaluator: {
  readonly tick: () => Promise<{ readonly steps: number }>;
}): Promise<void> {
  let quiet = 0;
  for (let tick = 0; tick < MAXIMUM_TICKS && quiet < 2; tick += 1) {
    quiet = (await evaluator.tick()).steps === 0 ? quiet + 1 : 0;
  }
  if (quiet < 2) throw new Error('o avaliador não ficou ocioso');
}

function decisionsOf(live: InMemoryLive): AnalystDecisionInput[] {
  return [...live.state.analystDecisions.values()].sort(
    (first, second) => first.candleTime - second.candleTime,
  );
}

describe('a linha gravada', () => {
  test('os valores de modo e estado do worker são os do banco (o banco não depende do worker)', () => {
    expect(ANALYST_RECORD_MODE.SHADOW).toBe(ANALYST_DECISION_MODE.SHADOW);
    expect(ANALYST_RECORD_STATUS).toStrictEqual(ANALYST_DECISION_STATUS);
  });
});

describe('a sombra não muda a simulação', () => {
  test('conjunto real de 15 min: sinais, ordens, operações, posições, saldo e comandos iguais byte a byte, e o estado do motor também', async () => {
    const plain = buildAnalystLive({ withAnalyst: false, candleCount: 900 });
    const shadow = buildAnalystLive({ withAnalyst: true, candleCount: 900 });
    await runToIdle(plain);
    await runToIdle(shadow);
    expect(plain.snapshot()['fills']?.length).toBeGreaterThan(0);
    expect(JSON.stringify(shadow.snapshot())).toBe(JSON.stringify(plain.snapshot()));
    expect(canonicalJson(shadow.state.checkpoint?.engineState ?? null)).toBe(
      canonicalJson(plain.state.checkpoint?.engineState ?? null),
    );
    expect(shadow.state.checkpoint?.lastCandleTime).toBe(plain.state.checkpoint?.lastCandleTime);
    expect(shadow.state.status).toBe(plain.state.status);
    expect(plain.state.analystDecisions.size).toBe(0);
  });

  test('conjunto real inteiro de 15 min (3.300 velas, a série cheia de 30 dias): também igual byte a byte', async () => {
    const lateStart = ANALYST_REAL_DATASET.candles[3000]?.openTime ?? 0;
    const overrides = { periodStart: lateStart };
    const plain = buildAnalystLive({ withAnalyst: false, overrides });
    const shadow = buildAnalystLive({ withAnalyst: true, overrides });
    await runToIdle(plain, 100);
    await runToIdle(shadow, 100);
    expect(JSON.stringify(shadow.snapshot())).toBe(JSON.stringify(plain.snapshot()));
    expect(shadow.state.analystDecisions.size).toBe(shadow.state.commits);
  });

  test.each(REAL_DATASETS.map((dataset) => [dataset.name, dataset] as const))(
    'o pedido de analista em %s (vela que não é a de 15 min) é ignorado: nada é decidido e a simulação é a mesma',
    async (_name, dataset) => {
      const plain = buildLive({ dataset });
      const requested = buildLive({ dataset, overrides: { analyst: ANALYST_SHADOW_REQUEST } });
      await runToIdle(plain);
      await runToIdle(requested);
      expect(requested.state.analystDecisions.size).toBe(0);
      expect(JSON.stringify(requested.snapshot())).toBe(JSON.stringify(plain.snapshot()));
    },
  );

  test.each([
    ['versão desconhecida', { version: 'analyst-9', mode: 'shadow' }],
    ['modo desconhecido', { version: 'analyst-1', mode: 'qualquer' }],
  ])('pedido com %s: o analista não decide', async (_name, analyst) => {
    const live = buildAnalystLive({ withAnalyst: false, candleCount: 300, overrides: { analyst } });
    await runToIdle(live);
    expect(live.state.analystDecisions.size).toBe(0);
    expect(live.state.commits).toBeGreaterThan(100);
  });
});

describe('uma decisão por passo, na mesma transação', () => {
  test('uma linha por vela confirmada, na grade de 15 min, em sombra, com a versão da regra', async () => {
    const live = buildAnalystLive({ withAnalyst: true, candleCount: 400 });
    await runToIdle(live);
    const decisions = decisionsOf(live);
    expect(decisions.length).toBe(live.state.commits);
    expect(decisions.every((row) => row.mode === 'shadow' && row.version === 'analyst-1')).toBe(
      true,
    );
    const times = decisions.map((row) => row.candleTime);
    expect(times).toStrictEqual(ANALYST_REAL_DATASET.candles.slice(0, 400).map((c) => c.openTime));
    expect(
      decisions.every((row) => row.status === 'decided' && row.failureCode === undefined),
    ).toBe(true);
  });

  test('uma ronda que ainda alcança o mercado não libera entrada: a vela atrasada é pausa por falta de dado', async () => {
    const live = buildAnalystLive({ withAnalyst: true, candleCount: 400 });
    await runToIdle(live, 250);
    const decisions = decisionsOf(live);
    const catchingUp = decisions.slice(0, 249);
    expect(catchingUp.every((row) => row.posture === 'pause' && row.reason === 'no_data')).toBe(
      true,
    );
    expect(catchingUp.every((row) => row.message?.includes('atrasada') === true)).toBe(true);
    expect(decisions[249]?.message?.includes('atrasada')).toBe(false);
  });

  test('queda no meio da transação desfaz o passo E a decisão; a retomada grava a vela uma vez só', async () => {
    let isSpent = false;
    const live = buildAnalystLive({
      withAnalyst: true,
      candleCount: 300,
      overrides: {
        hooks: {
          afterAppend: (commit) => {
            if (commit !== 100 || isSpent) return;
            isSpent = true;
            throw postgresCrash();
          },
        },
      },
    });
    await runToIdle(live, STEP_BY_STEP);
    expect(isSpent).toBe(true);
    expect(live.state.analystDecisions.size).toBe(live.state.commits);
    const times = decisionsOf(live).map((row) => row.candleTime);
    expect(times).toStrictEqual(ANALYST_REAL_DATASET.candles.slice(0, 300).map((c) => c.openTime));
  });

  test('retomar noutra instância dá as MESMAS decisões da execução contínua (histórico relido do banco)', async () => {
    const continuous = buildAnalystLive({ withAnalyst: true, candleCount: 700 });
    await runToIdle(continuous, 250);
    const resumed = buildAnalystLive({ withAnalyst: true, candleCount: 700 });
    const first = await createTestEvaluator(resumed, {
      instanceId: 'worker-a',
      maxStepsPerPass: 250,
    });
    await first.evaluator.tick();
    expect(resumed.state.commits).toBe(250);
    resumed.state.isHeartbeatExpired = true;
    const second = await createTestEvaluator(resumed, {
      instanceId: 'worker-b',
      maxStepsPerPass: 250,
    });
    await tickUntilIdle(second.evaluator);
    expect(resumed.state.analystDecisions.size).toBe(resumed.state.commits);
    expect(resumed.calls.readAnalystHistory).toBeGreaterThanOrEqual(3);
    const withoutRun = (live: InMemoryLive): string =>
      JSON.stringify(decisionsOf(live).map((row) => ({ ...row, runId: '' })));
    expect(withoutRun(resumed)).toBe(withoutRun(continuous));
    expect(JSON.stringify(resumed.snapshot())).toBe(JSON.stringify(continuous.snapshot()));
  });
});

describe('a falha da sombra grava só o código e o passo segue', () => {
  test('histórico ilegível: a linha é de falha, sem o texto do erro, e a simulação não muda', async () => {
    let failures = 0;
    const live = buildAnalystLive({
      withAnalyst: true,
      candleCount: 300,
      overrides: {
        hooks: {
          analystHistoryError: () => {
            failures += 1;
            return failures <= 2
              ? new Error('postgres://usuario:segredo-do-driver@host/banco')
              : undefined;
          },
        },
      },
    });
    const plain = buildAnalystLive({ withAnalyst: false, candleCount: 300 });
    const { entries } = await runWithLogger(live);
    await runToIdle(plain, LONG_PASS);
    const decisions = decisionsOf(live);
    expect(decisions.length).toBe(live.state.commits);
    const failed = decisions.filter((row) => row.status === 'failed');
    expect(failed.map((row) => row.candleTime)).toStrictEqual(
      ANALYST_REAL_DATASET.candles.slice(0, 2).map((c) => c.openTime),
    );
    for (const row of failed) {
      expect(row.failureCode).toBe('ANALYST_SERIES_UNAVAILABLE');
      expect(row.message).toBe(FAILURE_MESSAGE);
      expect(row.posture).toBeUndefined();
      expect(row.forecast).toBeUndefined();
      expect(row.specialists).toBeUndefined();
      expect(row.commands).toBeUndefined();
    }
    expect(decisions.slice(2).every((row) => row.status === 'decided')).toBe(true);
    expect(JSON.stringify(decisions)).not.toContain('segredo');
    expect(JSON.stringify(entries)).not.toContain('segredo');
    expect(JSON.stringify(live.snapshot())).toBe(JSON.stringify(plain.snapshot()));
    expect(live.state.status).toBe('running');
  });
});

async function runWithLogger(live: InMemoryLive): Promise<{ entries: readonly unknown[] }> {
  // Uma ronda de vários passos: a leitura que falhou na 1ª vela tem de ser tentada de novo na 2ª, na mesma ronda.
  const { evaluator, logger } = await createTestEvaluator(live, { maxStepsPerPass: LONG_PASS });
  await tickUntilQuiet(evaluator);
  return { entries: logger.entries };
}

function readField(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Object.getOwnPropertyDescriptor(value, name)?.value;
}

function findRow(rows: unknown, key: string): unknown {
  if (!Array.isArray(rows)) return undefined;
  const list: readonly unknown[] = rows;
  return list.find((item) => readField(item, 'key') === key);
}

function voteOfScore(score: string): VoteReading['vote'] {
  const value = Number(score);
  if (value === 0) return 0;
  return value < 0 ? -1 : 1;
}

function positionsAt(live: InMemoryLive, candleTime: number): AnalystPosition[] {
  return [...live.state.results.positions.values()]
    .filter((position) => position.openedCandleTime <= candleTime)
    .map((position) => {
      const isClosed =
        position.closedCandleTime !== undefined && position.closedCandleTime <= candleTime;
      return {
        openedCandleTime: position.openedCandleTime,
        closedCandleTime: isClosed ? (position.closedCandleTime ?? null) : null,
        netProfit: isClosed ? (position.netProfit ?? null) : null,
      };
    });
}

// A entrada que a regra PURA receberia, montada só do que a simulação deixou gravado e do recálculo da série desde a âncora.
function expectedInput(live: InMemoryLive, index: number): AnalystInput {
  const candles = ANALYST_REAL_DATASET.candles;
  const candle = candles[index];
  if (candle === undefined) throw new Error('vela fora do recorte');
  const anchor = computeSeriesAnchor(candle.openTime);
  const inside = candles.filter(
    (item) => item.openTime >= anchor && item.openTime <= candle.openTime,
  );
  const { market } = ANALYST_REAL_DATASET;
  const sentiments = selectSentiments({
    candles: inside,
    observations: ANALYST_REAL_SENTIMENT,
    source: market.sentimentSource,
  });
  const { signals, equityPoints } = live.state.results;
  const setup = classicSetup(ANALYST_REAL_DATASET);
  return {
    candleTime: candle.openTime,
    candles: inside,
    team: runSpecialistTeam({ market, candles: inside, sentiments }),
    strategyVotes: inside.map((item) => {
      const signal = signals.get(item.openTime);
      return {
        openTime: item.openTime,
        close: item.close,
        vote: signal === undefined ? null : voteOfScore(signal.score),
        isMissing: false,
        atr: null,
      };
    }),
    runCost: { feeRate: setup.parameters.feeRate, slippageRate: setup.parameters.slippageRate },
    riskPerTrade: CLASSIC_STRATEGY.config.risk.riskPerTrade,
    wallet: {
      initialBalance: setup.parameters.initialBalance,
      equity: equityPoints.get(candle.openTime)?.equity ?? setup.parameters.initialBalance,
      equityReference:
        equityPoints.get(candle.openTime - DAILY_WINDOW_MILLISECONDS)?.equity ?? null,
      isHalted: false,
      lastHaltReason: null,
      positions: positionsAt(live, candle.openTime),
    },
    goal: null,
    isWaitingForData: false,
    isCatchingUp: false,
  };
}

describe('a decisão gravada é a da regra pura sobre o que a simulação deixou', () => {
  const count = 800;
  const shared = buildAnalystLive({ withAnalyst: true, candleCount: count });
  const ready = runToIdle(shared, STEP_BY_STEP);

  test('em velas com posição aberta, com posição fechada e sem posição, a linha é a da regra recalculada à parte', async () => {
    await ready;
    const positions = [...shared.state.results.positions.values()];
    expect(positions.length).toBeGreaterThan(2);
    const candles = ANALYST_REAL_DATASET.candles;
    const indexOfTime = (time: number): number =>
      candles.findIndex((item) => item.openTime === time);
    const firstOpen = positions[0]?.openedCandleTime ?? 0;
    const firstClosed =
      positions.find((p) => p.closedCandleTime !== undefined)?.closedCandleTime ?? 0;
    const chosen = [
      ...new Set([
        indexOfTime(firstOpen) + 1,
        indexOfTime(firstClosed),
        indexOfTime(firstClosed) + 2,
        300,
        550,
        count - 1,
      ]),
    ];
    for (const index of chosen) {
      const candle = candles[index];
      const stored = shared.state.analystDecisions.get(candle?.openTime ?? 0);
      const decision = decideAnalyst(expectedInput(shared, index));
      expect(stored).toStrictEqual(parts.toDecidedRecord({ runId: shared.runId, decision }));
    }
  });

  test('a tendência da estratégia na tabela da equipe repete o auditor sobre os sinais gravados', async () => {
    await ready;
    const index = count - 1;
    const input = expectedInput(shared, index);
    const summary = auditVotes(input.strategyVotes, {
      decisionTime: input.candleTime,
      timeframeMilliseconds: CANDLE_MILLISECONDS,
      windowCandles: ANALYST_RULES.auditWindowCandles,
    });
    const stored = shared.state.analystDecisions.get(input.candleTime);
    const row = findRow(stored?.specialists, 'strategy');
    expect(summary.counted).toBeGreaterThan(0);
    expect(readField(row, 'counted')).toBe(summary.counted);
    expect(readField(row, 'hits')).toBe(summary.hits);
  });
});

describe('uma leitura de velas por par por ronda', () => {
  test('cinco simulações do mesmo par: o analista lê o par no máximo uma vez por ronda', async () => {
    const build = (withAnalyst: boolean): InMemoryLive[] =>
      Array.from({ length: 5 }, () => buildAnalystLive({ withAnalyst, candleCount: 260 }));
    const reads = (lives: readonly InMemoryLive[]): number =>
      lives.reduce((sum, live) => sum + live.calls.findCandles, 0);
    const run = async (lives: readonly InMemoryLive[]): Promise<number> => {
      const { evaluator } = await createTestEvaluator(combineLives(lives), {
        maxStepsPerPass: STEP_BY_STEP,
      });
      let ticks = 0;
      for (; ticks < MAXIMUM_TICKS; ticks += 1) {
        if ((await evaluator.tick()).steps === 0) break;
      }
      return ticks;
    };
    const plainLives = build(false);
    const shadowLives = build(true);
    const plainTicks = await run(plainLives);
    const shadowTicks = await run(shadowLives);
    expect(shadowTicks).toBe(plainTicks);
    const analystReads = reads(shadowLives) - reads(plainLives);
    expect(analystReads).toBeGreaterThan(0);
    expect(analystReads).toBeLessThanOrEqual(shadowTicks);
    for (const live of shadowLives)
      expect(live.state.analystDecisions.size).toBe(live.state.commits);
  });
});
