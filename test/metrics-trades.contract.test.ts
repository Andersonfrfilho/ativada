// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  computeRunMetrics,
  EXIT_REASON,
  METRICS_VERSION,
  reconcileRunMetrics,
  type ComputeRunMetricsParams,
  type RunMetrics,
} from '../packages/strategy-engine/src/index.js';
import {
  METRICS_BASE_TIME,
  MILLISECONDS_PER_DAY,
  buildPoints,
  equitySeries,
} from './fixtures/strategy-engine/metrics/metrics-series.fixture.js';
import { buildTrades } from './fixtures/strategy-engine/metrics/metrics-trades.fixture.js';

const TWO_DAYS = 2 * MILLISECONDS_PER_DAY;
const NO_TRADES = { value: null, reason: 'no_trades' } as const;

// O livro de teste, feito à mão: 7 operações fechadas e uma aberta. Saldo 1 000; 20 pontos de 2 dias (38 dias).
//   líquido:      +100  −40  −20  −30  +60  −10  +20     (soma 80)
//   taxa entrada: 0,10 0,20 0,30 0,40 0,50 0,60 0,70     (soma 2,8)
//   taxa saída:   1    2    3    4    5    6    7        (soma 28)   + 0,9 da posição aberta = 31,7
//   candles:      1→3  4→5  6→6  7→8  9→11 12→12 13→15   (abertura → saída); aberta no candle 17
const LEDGER_NETS = ['100', '-40', '-20', '-30', '60', '-10', '20'];
const LEDGER_SPANS: readonly (readonly [number, number])[] = [
  [1, 3],
  [4, 5],
  [6, 6],
  [7, 8],
  [9, 11],
  [12, 12],
  [13, 15],
];
const LEDGER_REASONS = [
  EXIT_REASON.TARGET,
  EXIT_REASON.STOP,
  EXIT_REASON.STOP,
  EXIT_REASON.SIGNAL,
  EXIT_REASON.STOP,
  EXIT_REASON.COMMAND,
  EXIT_REASON.GAP,
] as const;

function ledgerParams(): ComputeRunMetricsParams {
  const equities = [...Array.from({ length: 19 }, () => '1000'), '1105'];
  return {
    equityPoints: equitySeries({ equities, timeframeMilliseconds: TWO_DAYS }),
    closedPositions: buildTrades({
      timeframeMilliseconds: TWO_DAYS,
      specs: LEDGER_NETS.map((netProfit, index) => ({
        netProfit,
        opened: LEDGER_SPANS[index]?.[0] ?? 0,
        closed: LEDGER_SPANS[index]?.[1] ?? 0,
        entryFee: `0.${index + 1}0`,
        exitFee: String(index + 1),
        exitReason: LEDGER_REASONS[index] ?? EXIT_REASON.SIGNAL,
      })),
    }),
    openPosition: {
      openedCandleOpenTime: METRICS_BASE_TIME + 17 * TWO_DAYS,
      entryFee: '0.9',
      unrealizedProfit: '25',
    },
    run: { initialBalance: '1000', timeframeMilliseconds: TWO_DAYS },
  };
}

function tradesOnly(
  nets: readonly string[],
  overrides?: Partial<ComputeRunMetricsParams>,
): RunMetrics {
  return computeRunMetrics({
    equityPoints: equitySeries({ equities: ['1000', '1000'], timeframeMilliseconds: TWO_DAYS }),
    closedPositions: buildTrades({
      timeframeMilliseconds: TWO_DAYS,
      specs: nets.map((netProfit, index) => ({ netProfit, opened: index, closed: index })),
    }),
    openPosition: null,
    run: { initialBalance: '1000', timeframeMilliseconds: TWO_DAYS },
    ...overrides,
  });
}

describe('trade statistics (the hand ledger)', () => {
  const metrics = computeRunMetrics(ledgerParams());

  test('counts: 7 closed, 3 wins (100, 60, 20), 4 losses (−40, −20, −30, −10)', () => {
    expect(metrics.trades).toBe(7);
    expect(metrics.wins).toBe(3);
    expect(metrics.losses).toBe(4);
    expect(metrics.version).toBe(METRICS_VERSION);
  });

  test('gross profit 180, gross loss 100 (a magnitude), net profit 80', () => {
    expect(metrics.grossProfit).toBe('180');
    expect(metrics.grossLoss).toBe('100');
    expect(metrics.netProfit).toBe('80');
  });

  test('win rate 3 ÷ 7, profit factor 180 ÷ 100, average trade 80 ÷ 7, payoff 60 ÷ 25', () => {
    expect(metrics.winRate).toStrictEqual({ value: '0.428571428571', reason: null });
    expect(metrics.profitFactor).toStrictEqual({ value: '1.8', reason: null });
    expect(metrics.averageTrade).toStrictEqual({ value: '11.428571428571', reason: null });
    expect(metrics.averageWin).toStrictEqual({ value: '60', reason: null });
    expect(metrics.averageLoss).toStrictEqual({ value: '25', reason: null });
    expect(metrics.payoffRatio).toStrictEqual({ value: '2.4', reason: null });
  });

  test('expectancy = 3/7 × 60 − 4/7 × 25 = 80/7', () => {
    expect(metrics.expectancy).toStrictEqual({ value: '11.428571428571', reason: null });
  });

  test('the longest losing streak is 3 (−40, −20, −30), not the last one (−10)', () => {
    expect(metrics.maxConsecutiveLosses).toBe(3);
  });

  test('fees paid = entry 2,8 + exit 28 + the open position entry fee 0,9 = 31,7', () => {
    expect(metrics.feesPaid).toBe('31.7');
  });

  test('exits by reason', () => {
    expect(metrics.exitReasonCounts).toStrictEqual({
      stop: 3,
      target: 1,
      signal: 1,
      command: 1,
      gap: 1,
    });
  });

  test('the open position is reported apart and does not enter the counts', () => {
    expect(metrics.openPosition).toStrictEqual({
      openedCandleOpenTime: METRICS_BASE_TIME + 17 * TWO_DAYS,
      entryFee: '0.9',
      unrealizedProfit: '25',
    });
  });

  test('exposure: closes with a position held = 2 + 1 + 0 + 1 + 2 + 0 + 2 + 3 (open) = 11 of 20 = 0,55', () => {
    // Abertura a saída (o candle da saída não conta): [1,3)=2, [4,5)=1, [6,6)=0, [7,8)=1, [9,11)=2,
    // [12,12)=0, [13,15)=2, e a aberta, de 17 ao fim (17, 18, 19) = 3.
    expect(metrics.exposure).toStrictEqual({ value: '0.55', reason: null });
  });

  test('trades per year = 7 × 365,25 ÷ 38 days', () => {
    expect(metrics.tradesPerYear).toStrictEqual({ value: '67.282894736842', reason: null });
  });
});

describe('trade statistics at the edges', () => {
  test('no trades: every ratio is null with no_trades, every sum is 0', () => {
    const metrics = tradesOnly([]);
    for (const metric of [
      metrics.winRate,
      metrics.profitFactor,
      metrics.averageTrade,
      metrics.expectancy,
      metrics.averageWin,
      metrics.averageLoss,
      metrics.payoffRatio,
    ]) {
      expect(metric).toStrictEqual(NO_TRADES);
    }
    expect(metrics.trades).toBe(0);
    expect(metrics.netProfit).toBe('0');
    expect(metrics.feesPaid).toBe('0');
    expect(metrics.maxConsecutiveLosses).toBe(0);
    expect(metrics.exposure).toStrictEqual({ value: '0', reason: null });
  });

  test('only wins: no loss, so no profit factor, no average loss, no payoff', () => {
    const metrics = tradesOnly(['10', '20']);
    expect(metrics.winRate.value).toBe('1');
    expect(metrics.profitFactor).toStrictEqual({ value: null, reason: 'no_losses' });
    expect(metrics.averageLoss).toStrictEqual({ value: null, reason: 'no_losses' });
    expect(metrics.payoffRatio).toStrictEqual({ value: null, reason: 'no_losses' });
    expect(metrics.averageWin.value).toBe('15');
    expect(metrics.expectancy.value).toBe('15');
  });

  test('only losses: profit factor 0, no average win, expectancy −20', () => {
    const metrics = tradesOnly(['-10', '-30']);
    expect(metrics.winRate.value).toBe('0');
    expect(metrics.profitFactor).toStrictEqual({ value: '0', reason: null });
    expect(metrics.averageWin).toStrictEqual({ value: null, reason: 'no_wins' });
    expect(metrics.payoffRatio).toStrictEqual({ value: null, reason: 'no_wins' });
    expect(metrics.averageLoss.value).toBe('20');
    expect(metrics.expectancy.value).toBe('-20');
    expect(metrics.maxConsecutiveLosses).toBe(2);
  });

  test('breakeven trades are neither wins nor losses and break a losing streak', () => {
    const metrics = tradesOnly(['-5', '0', '-5']);
    expect([metrics.trades, metrics.wins, metrics.losses]).toStrictEqual([3, 0, 2]);
    expect(metrics.maxConsecutiveLosses).toBe(1);
    expect(metrics.winRate.value).toBe('0');
    expect(tradesOnly(['0', '0']).profitFactor.reason).toBe('no_losses');
    expect(tradesOnly(['0', '0']).averageTrade.value).toBe('0');
  });

  test('only an open position: no closed trade, but its entry fee was paid', () => {
    const metrics = tradesOnly([], {
      openPosition: {
        openedCandleOpenTime: METRICS_BASE_TIME,
        entryFee: '1.5',
        unrealizedProfit: '-3',
      },
    });
    expect(metrics.winRate).toStrictEqual(NO_TRADES);
    expect(metrics.feesPaid).toBe('1.5');
    expect(metrics.exposure.value).toBe('1');
    expect(metrics.openPosition?.unrealizedProfit).toBe('-3');
  });

  test('a period under 30 days has no trades per year', () => {
    const metrics = computeRunMetrics({
      ...ledgerParams(),
      equityPoints: buildPoints({
        specs: [{ equity: '1000' }, { equity: '1010' }],
        timeframeMilliseconds: MILLISECONDS_PER_DAY,
      }),
    });
    expect(metrics.tradesPerYear).toStrictEqual({ value: null, reason: 'period_too_short' });
    expect(metrics.annualizedReturn.reason).toBe('period_too_short');
  });
});

describe('the books close', () => {
  function reconcileOf(finalEquity: string): ReturnType<typeof reconcileRunMetrics> {
    const params = ledgerParams();
    const equities = [...Array.from({ length: 19 }, () => '1000'), finalEquity];
    return reconcileRunMetrics(
      computeRunMetrics({
        ...params,
        equityPoints: equitySeries({ equities, timeframeMilliseconds: TWO_DAYS }),
      }),
    );
  }

  test('80 realized + 25 unrealized = 1 105 − 1 000: reconciled, to the last digit', () => {
    expect(reconcileOf('1105')).toStrictEqual({
      expectedVariation: '105',
      realizedProfit: '80',
      unrealizedProfit: '25',
      accountedVariation: '105',
      difference: '0',
      isReconciled: true,
    });
  });

  test('one unit missing is a difference, not a rounding', () => {
    const books = reconcileOf('1104');
    // A conta explica 105 e o patrimônio mudou 104: sobra 1 (contabilizado − esperado).
    expect(books.difference).toBe('1');
    expect(books.isReconciled).toBe(false);
  });

  test('fees are NOT deducted again: they are inside the net profit and the unrealized profit', () => {
    const books = reconcileOf('1105');
    expect(books.accountedVariation).toBe('105');
  });

  test('without points the variation is 0 and the books close only when nothing happened', () => {
    const empty: RunMetrics = computeRunMetrics({
      equityPoints: [],
      closedPositions: [],
      openPosition: null,
      run: { initialBalance: '1000', timeframeMilliseconds: TWO_DAYS },
    });
    expect(reconcileRunMetrics(empty).isReconciled).toBe(true);
  });
});

describe('input contract', () => {
  const reject = (override: Partial<ComputeRunMetricsParams>): (() => unknown) => {
    return () => computeRunMetrics({ ...ledgerParams(), ...override });
  };

  test('is pure: frozen inputs are not touched and the answer repeats', () => {
    const params = ledgerParams();
    const frozen = structuredClone(params);
    const first = computeRunMetrics(params);
    expect(params).toStrictEqual(frozen);
    expect(computeRunMetrics(params)).toStrictEqual(first);
  });

  test('refuses what is not a finite decimal, a positive equity or an ordered series', () => {
    const points = ledgerParams().equityPoints;
    const [first = points[0], second = points[1]] = points;
    expect(reject({ equityPoints: [{ ...first!, equity: 'NaN' }] })).toThrow('finito');
    expect(reject({ equityPoints: [{ ...first!, equity: 'Infinity' }] })).toThrow('finito');
    expect(reject({ equityPoints: [{ ...first!, equity: 'abc' }] })).toThrow('decimal');
    expect(reject({ equityPoints: [{ ...first!, equity: '0' }] })).toThrow('positivo');
    expect(reject({ equityPoints: [{ ...first!, equityAtLow: '1001' }] })).toThrow('equityAtLow');
    expect(reject({ equityPoints: [second!, first!] })).toThrow('ordem');
  });

  test('refuses overlapping positions, unknown exit reasons and a bad run', () => {
    const trades = ledgerParams().closedPositions;
    const [first, second] = trades;
    expect(reject({ closedPositions: [second!, first!] })).toThrow('ordem');
    expect(reject({ closedPositions: [{ ...first!, exitReason: 'magic' as never }] })).toThrow(
      'motivo',
    );
    expect(reject({ run: { initialBalance: '0', timeframeMilliseconds: TWO_DAYS } })).toThrow(
      'saldo',
    );
    expect(reject({ run: { initialBalance: '1000', timeframeMilliseconds: 0 } })).toThrow(
      'timeframe',
    );
  });
});
