// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  computeStrategyLeadInCandles,
  createEngine,
  createStrategyVersion,
  type StoredSentimentObservation,
} from '../packages/strategy-engine/src/index.js';
import {
  buildLive,
  classicSetup,
  createTestEvaluator,
  LEAD_IN_CANDLES,
  runReference,
  tickUntilIdle,
} from './fixtures/live/live-scenarios.fixture.js';
import { SENTIMENT_CONFIG } from './fixtures/strategy-engine/signal/scoreboard-configs.fixture.js';
import {
  CLASSIC_STRATEGY,
  REAL_DATASETS,
  type RealDataset,
} from './fixtures/strategy-engine/signal/classic-signals.fixture.js';

function requireDataset(index: number): RealDataset {
  const dataset = REAL_DATASETS[index];
  if (dataset === undefined) throw new Error('conjunto real ausente');
  return dataset;
}

const BTC_HOURLY = requireDataset(0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function firstIndexWithOpenPosition(): number {
  const engine = createEngine();
  const setup = classicSetup(BTC_HOURLY);
  let state = engine.createInitialState({ strategy: CLASSIC_STRATEGY, run: setup });
  let previous: number | null = null;
  for (const [index, candle] of BTC_HOURLY.candles.entries()) {
    const gap = previous === null ? 0 : (candle.openTime - previous) / HOUR - 1;
    const result = engine.step({
      strategy: CLASSIC_STRATEGY,
      run: setup,
      state,
      candle,
      confirmedGapCandles: gap > 0 ? gap : undefined,
    });
    state = result.state;
    previous = candle.openTime;
    if (state.wallet.position !== null) return index;
  }
  throw new Error('o conjunto real não abre posição');
}

describe('avaliador ao vivo: retomada com posição aberta', () => {
  test('a posição aberta vem do checkpoint e a saída dela é gravada igual ao fluxo contínuo', async () => {
    const stopAt = firstIndexWithOpenPosition();
    const live = buildLive({ dataset: BTC_HOURLY });
    const first = await createTestEvaluator(live, {
      instanceId: 'worker-a',
      maxStepsPerPass: stopAt + 1,
    });
    await first.evaluator.tick();
    expect(live.state.commits).toBe(stopAt + 1);
    live.state.isHeartbeatExpired = true;
    const second = await createTestEvaluator(live, { instanceId: 'worker-b' });
    await tickUntilIdle(second.evaluator);
    expect(live.state.status).toBe('running');
    expect(live.snapshot()).toStrictEqual(
      runReference({ setup: classicSetup(BTC_HOURLY), candles: BTC_HOURLY.candles }).rows,
    );
  });
});

describe('avaliador ao vivo: sentimento', () => {
  const strategy = createStrategyVersion(SENTIMENT_CONFIG);
  const leadIn = computeStrategyLeadInCandles(strategy.config);
  const firstDay = Math.floor((BTC_HOURLY.candles[0]?.openTime ?? 0) / DAY) * DAY;

  function observations(): StoredSentimentObservation[] {
    const days = Math.ceil(BTC_HOURLY.candles.length / 24) + 2;
    return Array.from({ length: days }, (_unused, index) => {
      const observedAt = firstDay + (index + 1) * DAY;
      return {
        value: index % 2 === 0 ? 10 : 90,
        observedAt,
        source: 'alternative.me',
        // Um terço entra no banco ATRASADO: só vale para os candles que fecham depois da inserção.
        createdAt: index % 3 === 0 ? observedAt + 2 * DAY : observedAt,
      };
    });
  }

  test('o sentimento disponível no fechamento de cada candle entra no motor, com o corte de inserção', async () => {
    const sentiment = observations();
    const live = buildLive({
      dataset: BTC_HOURLY,
      overrides: { strategy, sentiment },
    });
    const { evaluator } = await createTestEvaluator(live);
    await tickUntilIdle(evaluator);
    const reference = runReference({
      strategy,
      setup: classicSetup(BTC_HOURLY),
      candles: BTC_HOURLY.candles.slice(LEAD_IN_CANDLES - leadIn),
      observations: sentiment,
    });
    expect(live.snapshot()).toStrictEqual(reference.rows);
    const used = (live.snapshot()['signals'] ?? []).filter(
      (row) => (row as { sentimentObservation?: unknown }).sentimentObservation !== undefined,
    );
    expect(used.length).toBeGreaterThan(0);
  });
});

describe('avaliador ao vivo: checkpoint que não é desta execução', () => {
  async function resumeWith(
    patch: (checkpoint: { engineState: Record<string, unknown>; lastCandleTime: number }) => void,
  ): Promise<string | undefined> {
    const live = buildLive({ dataset: BTC_HOURLY });
    const first = await createTestEvaluator(live, { maxStepsPerPass: 30 });
    await first.evaluator.tick();
    const checkpoint = live.state.checkpoint;
    if (checkpoint === undefined) throw new Error('sem checkpoint');
    const patched = {
      engineState: structuredClone(checkpoint.engineState) as Record<string, unknown>,
      lastCandleTime: checkpoint.lastCandleTime,
    };
    patch(patched);
    live.state.checkpoint = { ...checkpoint, ...patched };
    live.state.isHeartbeatExpired = true;
    const second = await createTestEvaluator(live, { instanceId: 'worker-b' });
    await tickUntilIdle(second.evaluator);
    return live.state.errorCode;
  }

  test('estado de outros parâmetros da execução (runHash) é recusado', async () => {
    const code = await resumeWith((checkpoint) => {
      checkpoint.engineState['runHash'] = 'a'.repeat(64);
    });
    expect(code).toBe('ENGINE_STATE_UNUSABLE');
  });

  test('estado de outra versão da estratégia (configHash) é recusado', async () => {
    const code = await resumeWith((checkpoint) => {
      checkpoint.engineState['configHash'] = 'b'.repeat(64);
    });
    expect(code).toBe('ENGINE_STATE_UNUSABLE');
  });

  test('checkpoint cujo último candle não é o do estado é recusado (retomar pularia ou repetiria um passo)', async () => {
    const code = await resumeWith((checkpoint) => {
      checkpoint.lastCandleTime += HOUR;
    });
    expect(code).toBe('ENGINE_STATE_UNUSABLE');
  });

  test('execução criada para outra versão do motor falha com ENGINE_VERSION_MISMATCH', async () => {
    const live = buildLive({ dataset: BTC_HOURLY, overrides: { tamper: 'engine_version' } });
    const { evaluator } = await createTestEvaluator(live);
    await tickUntilIdle(evaluator);
    expect(live.state.errorCode).toBe('ENGINE_VERSION_MISMATCH');
    expect(live.state.commits).toBe(0);
  });
});

describe('avaliador ao vivo: o que sai no log e no banco quando algo dá errado', () => {
  test('erro inesperado vira LIVE_UNEXPECTED sem levar o texto do erro original', async () => {
    const live = buildLive({
      dataset: BTC_HOURLY,
      overrides: {
        hooks: {
          afterAppend: (commit) => {
            if (commit === 5) throw new Error('segredo-xyz postgres://usuario:senha@host/banco');
          },
        },
      },
    });
    const { evaluator, logger } = await createTestEvaluator(live);
    await tickUntilIdle(evaluator);
    expect(live.state.errorCode).toBe('LIVE_UNEXPECTED');
    expect(JSON.stringify(logger.entries)).not.toContain('segredo');
    expect(JSON.stringify(live.state)).not.toContain('segredo');
  });

  test('violação de integridade do dado (SQLSTATE 23514) é defeito, não instabilidade: falha em vez de repetir para sempre', async () => {
    const live = buildLive({
      dataset: BTC_HOURLY,
      overrides: {
        hooks: {
          afterAppend: (commit) => {
            if (commit === 5) throw Object.assign(new Error('check'), { code: '23514' });
          },
        },
      },
    });
    const { evaluator } = await createTestEvaluator(live);
    const totals = await tickUntilIdle(evaluator);
    expect(totals.failed).toBe(1);
    expect(live.state.errorCode).toBe('LIVE_UNEXPECTED');
  });

  test('execução encerrada não é avaliada de novo: cancelada, sai da lista e não gasta consulta', async () => {
    const live = buildLive({
      dataset: BTC_HOURLY,
      overrides: {
        hooks: { afterCommit: (commit, controls) => commit === 3 && controls.cancel() },
      },
    });
    const { evaluator } = await createTestEvaluator(live);
    await evaluator.tick();
    expect(live.state.status).toBe('cancelled');
    const callsBefore = live.calls.findCandles;
    const summary = await evaluator.tick();
    expect(summary.evaluated).toBe(0);
    expect(live.calls.findCandles).toBe(callsBefore);
  });
});
