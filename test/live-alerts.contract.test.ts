// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';
import type {
  AlertInput,
  OrderInput,
  PositionInput,
  SignalInput,
} from '../packages/database/src/index.js';
import {
  EngineDecimal,
  formatEngineDecimal,
  type EngineCandle,
} from '../packages/strategy-engine/src/index.js';
import type { InMemoryLive } from './fixtures/live/in-memory-live-database.fixture.js';
import {
  buildLive,
  classicSetup,
  createTestEvaluator,
  postgresCrash,
  runReference,
  tickUntilIdle,
} from './fixtures/live/live-scenarios.fixture.js';
import {
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
const EVERYTHING_IS_FRESH = 1_000_000;
const HIT_RATE = { winRate: '0.583333333333', trades: 24 } as const;

function lastCandle(): EngineCandle {
  const candle = BTC_HOURLY.candles.at(-1);
  if (candle === undefined) throw new Error('conjunto sem candles');
  return candle;
}

function allFresh(): { readonly now: () => number; readonly maxAgeCandles: number } {
  return { now: () => lastCandle().closeTime, maxAgeCandles: EVERYTHING_IS_FRESH };
}

function rowsOf<TRow>(live: InMemoryLive, table: string): readonly TRow[] {
  return live.snapshot()[table] as readonly TRow[];
}

function signalsToAlert(live: InMemoryLive): readonly SignalInput[] {
  return rowsOf<SignalInput>(live, 'signals').filter((signal) => signal.action !== 'HOLD');
}

function alertsOf(live: InMemoryLive): readonly AlertInput[] {
  return [...live.state.alerts.values()];
}

function payloadOf(alert: AlertInput): Record<string, unknown> {
  return alert.payload as Record<string, unknown>;
}

async function runAll(
  live: InMemoryLive,
  alerting: { readonly now: () => number; readonly maxAgeCandles: number } | null = allFresh(),
): Promise<void> {
  const { evaluator } = await createTestEvaluator(live, {
    maxStepsPerPass: 200,
    ...(alerting === null ? {} : { alerting }),
  });
  await tickUntilIdle(evaluator);
}

function candleAt(openTime: number): EngineCandle {
  const candle = BTC_HOURLY.candles.find((item) => item.openTime === openTime);
  if (candle === undefined) throw new Error(`candle ${openTime} ausente`);
  return candle;
}

describe('alerta de sinal no passo ao vivo: um por candle, só BUY e SELL', () => {
  test('cada sinal BUY e SELL vira UM alerta no candle e no lado dele; HOLD nunca', async () => {
    const live = buildLive({ dataset: BTC_HOURLY });
    await runAll(live);
    const expected = signalsToAlert(live).map((signal) => `${signal.candleTime}|${signal.action}`);
    expect(expected.length).toBeGreaterThan(0);
    expect(alertsOf(live).map((alert) => `${alert.candleTime}|${alert.side}`)).toStrictEqual(
      expected,
    );
  });

  test('o conteúdo traz par, preço, placar, regime e o MOTIVO que o motor gravou', async () => {
    const live = buildLive({ dataset: BTC_HOURLY });
    await runAll(live);
    const signals = new Map(
      signalsToAlert(live).map((signal) => [`${signal.candleTime}|${signal.action}`, signal]),
    );
    for (const alert of alertsOf(live)) {
      const signal = signals.get(`${alert.candleTime}|${alert.side}`);
      expect(payloadOf(alert)).toMatchObject({
        symbol: BTC_HOURLY.candles[0]?.symbol,
        timeframe: BTC_HOURLY.candles[0]?.timeframe,
        closePrice: candleAt(alert.candleTime).close,
        score: signal?.score,
        regime: signal?.regime,
        reason: signal?.reason,
      });
    }
  });

  test('compra com ordem de entrada: stop e alvo saem do fechamento menos e mais as distâncias da ordem', async () => {
    const live = buildLive({ dataset: BTC_HOURLY });
    await runAll(live);
    const orders = rowsOf<OrderInput>(live, 'orders');
    const entries = alertsOf(live).filter(
      (alert) => payloadOf(alert)['simulatedAction'] === 'enter',
    );
    expect(entries.length).toBeGreaterThan(0);
    for (const alert of entries) {
      const order = orders.find(
        (item) => item.createdCandleTime === alert.candleTime && item.purpose === 'entry',
      );
      const close = new EngineDecimal(candleAt(alert.candleTime).close);
      expect(alert.side).toBe('BUY');
      expect(payloadOf(alert)['stopPrice']).toBe(
        formatEngineDecimal(close.minus(order?.stopDistance ?? '0')),
      );
      expect(payloadOf(alert)['targetPrice']).toBe(
        formatEngineDecimal(close.plus(order?.targetDistance ?? '0')),
      );
    }
  });

  test('venda com posição aberta: leva o stop e o alvo DA POSIÇÃO, e a ação simulada é sair', async () => {
    const live = buildLive({ dataset: BTC_HOURLY });
    await runAll(live);
    const positions = rowsOf<PositionInput>(live, 'positions');
    const exits = alertsOf(live).filter((alert) => payloadOf(alert)['simulatedAction'] === 'exit');
    expect(exits.length).toBeGreaterThan(0);
    for (const alert of exits) {
      const open = positions.find(
        (position) =>
          position.openedCandleTime < alert.candleTime &&
          (position.closedCandleTime === undefined || position.closedCandleTime > alert.candleTime),
      );
      expect(alert.side).toBe('SELL');
      expect(payloadOf(alert)['stopPrice']).toBe(open?.stopPrice);
      expect(payloadOf(alert)['targetPrice']).toBe(open?.targetPrice);
    }
  });

  test('sinal sem ordem nova: leva os níveis da posição aberta, ou nenhum nível se não há posição', async () => {
    const live = buildLive({ dataset: BTC_HOURLY });
    await runAll(live);
    const positions = rowsOf<PositionInput>(live, 'positions');
    const idle = alertsOf(live).filter((alert) => payloadOf(alert)['simulatedAction'] === 'none');
    expect(idle.length).toBeGreaterThan(0);
    for (const alert of idle) {
      const open = positions.find(
        (position) =>
          position.openedCandleTime <= alert.candleTime &&
          (position.closedCandleTime === undefined || position.closedCandleTime > alert.candleTime),
      );
      expect(payloadOf(alert)['stopPrice']).toBe(open?.stopPrice ?? null);
      expect(payloadOf(alert)['targetPrice']).toBe(open?.targetPrice ?? null);
    }
  });

  test('sem a configuração de alerta (Telegram desligado) nenhum alerta é montado', async () => {
    const live = buildLive({ dataset: BTC_HOURLY });
    await runAll(live, null);
    expect(alertsOf(live)).toHaveLength(0);
    expect(signalsToAlert(live).length).toBeGreaterThan(0);
    expect(live.calls.findHitRate).toBe(0);
  });
});

describe('alerta de sinal: só o que ainda é notícia', () => {
  const reference = runReference({ setup: classicSetup(BTC_HOURLY), candles: BTC_HOURLY.candles });
  const signals = reference.rows['signals'] as readonly SignalInput[];
  const lastActionable = signals.filter((signal) => signal.action !== 'HOLD').at(-1);
  const cut = BTC_HOURLY.candles.findIndex((item) => item.openTime === lastActionable?.candleTime);
  const replay = BTC_HOURLY.candles.slice(0, cut + 1);
  const closeOfLast = candleAt(lastActionable?.candleTime ?? 0).closeTime;

  test('o último candle do replay é acionável (premissa do teste)', () => {
    expect(lastActionable).toBeDefined();
    expect(cut).toBeGreaterThan(0);
  });

  test('candle antigo (replay, retomada depois de horas parado) não alerta', async () => {
    const live = buildLive({ dataset: BTC_HOURLY, candles: replay });
    await runAll(live, { now: () => closeOfLast + 10 * HOUR, maxAgeCandles: 2 });
    expect(alertsOf(live)).toHaveLength(0);
  });

  test('candle dentro da janela de frescor alerta; um milissegundo além, não', async () => {
    const fresh = buildLive({ dataset: BTC_HOURLY, candles: replay });
    await runAll(fresh, { now: () => closeOfLast + 2 * HOUR, maxAgeCandles: 2 });
    expect(alertsOf(fresh).map((alert) => alert.candleTime)).toStrictEqual([
      lastActionable?.candleTime ?? 0,
    ]);
    const stale = buildLive({ dataset: BTC_HOURLY, candles: replay });
    await runAll(stale, { now: () => closeOfLast + 2 * HOUR + 1, maxAgeCandles: 2 });
    expect(alertsOf(stale)).toHaveLength(0);
  });
});

describe('alerta de sinal: queda e reentrega não repetem nem perdem', () => {
  test.each([1, 60, 200, 400])(
    'queda dentro do passo %i: os mesmos alertas, uma vez cada',
    async (point) => {
      const crashed = { isDone: false };
      const live = buildLive({
        dataset: BTC_HOURLY,
        overrides: {
          hooks: {
            afterAppend: (commit) => {
              if (commit === point && !crashed.isDone) {
                crashed.isDone = true;
                throw postgresCrash();
              }
            },
          },
        },
      });
      const first = await createTestEvaluator(live, {
        instanceId: 'worker-doomed',
        alerting: allFresh(),
      });
      await tickUntilIdle(first.evaluator);
      live.state.isHeartbeatExpired = true;
      const second = await createTestEvaluator(live, {
        instanceId: 'worker-rescuer',
        alerting: allFresh(),
      });
      await tickUntilIdle(second.evaluator);
      const undisturbed = buildLive({ dataset: BTC_HOURLY });
      await runAll(undisturbed);
      expect(crashed.isDone).toBe(true);
      expect(alertsOf(live)).toStrictEqual(alertsOf(undisturbed));
    },
  );

  test('leitura atrasada (a fonte repete candles) não cria alerta novo', async () => {
    const live = buildLive({ dataset: BTC_HOURLY, overrides: { hooks: { isStaleRead: true } } });
    const { evaluator } = await createTestEvaluator(live, {
      maxStepsPerPass: BTC_HOURLY.candles.length * 2,
      alerting: allFresh(),
    });
    await tickUntilIdle(evaluator);
    const before = alertsOf(live);
    await evaluator.tick();
    await evaluator.tick();
    expect(alertsOf(live)).toStrictEqual(before);
    expect(before.length).toBe(signalsToAlert(live).length);
  });
});

describe('alerta de sinal: acerto histórico da versão', () => {
  test('o acerto fora da amostra do último walk-forward entra no conteúdo', async () => {
    const live = buildLive({ dataset: BTC_HOURLY, overrides: { hitRate: HIT_RATE } });
    await runAll(live);
    for (const alert of alertsOf(live)) {
      expect(payloadOf(alert)['hitRate']).toStrictEqual({ ...HIT_RATE });
    }
  });

  test('sem walk-forward concluído o campo é nulo, nunca inventado', async () => {
    const live = buildLive({ dataset: BTC_HOURLY });
    await runAll(live);
    for (const alert of alertsOf(live)) expect(payloadOf(alert)['hitRate']).toBeNull();
  });

  test('a leitura que falha NÃO quebra o passo: tudo é gravado e o acerto fica nulo', async () => {
    const live = buildLive({ dataset: BTC_HOURLY, overrides: { hitRate: 'error' } });
    const { evaluator, logger } = await createTestEvaluator(live, {
      maxStepsPerPass: 200,
      alerting: allFresh(),
    });
    await tickUntilIdle(evaluator);
    expect(live.state.commits).toBe(BTC_HOURLY.candles.length);
    expect(live.state.status).toBe('running');
    expect(logger.entries.filter((entry) => entry.level === 'error')).toHaveLength(0);
    expect(alertsOf(live).length).toBeGreaterThan(0);
    for (const alert of alertsOf(live)) expect(payloadOf(alert)['hitRate']).toBeNull();
  });

  test('a leitura é UMA por ronda, não uma por sinal', async () => {
    const live = buildLive({ dataset: BTC_HOURLY, overrides: { hitRate: HIT_RATE } });
    const { evaluator } = await createTestEvaluator(live, {
      maxStepsPerPass: 200,
      alerting: allFresh(),
    });
    const totals = await tickUntilIdle(evaluator);
    expect(alertsOf(live).length).toBeGreaterThan(totals.ticks);
    expect(live.calls.findHitRate).toBeLessThanOrEqual(totals.ticks);
  });
});

describe('alerta de sinal: a simulação não muda', () => {
  test('com alerta ligado, as linhas gravadas são as do motor rodado direto', async () => {
    const live = buildLive({ dataset: BTC_HOURLY });
    await runAll(live);
    const reference = runReference({
      setup: classicSetup(BTC_HOURLY),
      candles: BTC_HOURLY.candles,
    });
    expect(live.snapshot()).toStrictEqual(reference.rows);
  });
});
