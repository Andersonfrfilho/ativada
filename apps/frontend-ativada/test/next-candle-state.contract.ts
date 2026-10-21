// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  computePanelWindow,
  describeHorizon,
  formatRemaining,
  isPanelDrawable,
  judgeNextCandle,
  NEXT_CANDLE_TEXT,
  STALE_FORECAST_GRACE_MILLISECONDS,
  type JudgeNextCandleParams,
  type NextCandleState,
} from '../src/runs/candle-chart/next-candle-state.js';
import {
  EMPTY_TRAIL,
  extendTrail,
  MAX_TRAIL_POINTS,
} from '../src/runs/candle-chart/price-trail.js';
import { formatPriceEdge } from '../src/format/format.js';
import {
  describeResult,
  findRecentResult,
  formatIntervalLimitPercent,
  formatRatePercent,
  ratePercentAttribute,
} from '../src/runs/candle-chart/projection-text.js';
import {
  projectionsSchema,
  type ProjectionCurrent,
  type ProjectionItem,
} from '../src/runs/candle-chart/projections.validation.js';
import {
  buildProjectionItem,
  buildProjectionsResponse,
  FIRST_CANDLE_TIME,
  HOUR_MILLISECONDS,
} from './support/candle-chart-fixtures.js';

const MINUTE = 60_000;

function currentOf(overrides: Record<string, unknown> = {}): ProjectionCurrent {
  const current = Object.assign({}, buildProjectionsResponse()['current'], overrides);
  return projectionsSchema.parse(buildProjectionsResponse({ current })).current;
}

function judge(overrides: Partial<JudgeNextCandleParams> = {}): NextCandleState {
  return judgeNextCandle({
    isStrategyTimeframe: true,
    runTimeframe: '1h',
    projection: currentOf(),
    isError: false,
    live: undefined,
    now: FIRST_CANDLE_TIME + HOUR_MILLISECONDS,
    ...overrides,
  });
}

describe('estado do painel da próxima vela (RF16)', () => {
  test('with a trend the state is available and carries the server projection', () => {
    const state = judge();
    expect(state.kind).toBe('available');
    expect(state.kind === 'available' ? state.current.label : '').toBe('Tende a COMPRAR · fraco');
  });

  test('a forecast past its horizon with no newer one stops counting after the grace period', () => {
    const horizonEnd = FIRST_CANDLE_TIME + 2 * HOUR_MILLISECONDS;
    expect(judge({ now: horizonEnd + STALE_FORECAST_GRACE_MILLISECONDS }).kind).toBe('available');
    const stale = judge({ now: horizonEnd + STALE_FORECAST_GRACE_MILLISECONDS + 1 });
    expect(stale).toStrictEqual({
      kind: 'unavailable',
      reason: 'stale_forecast',
      message: NEXT_CANDLE_TEXT.STALE_FORECAST,
    });
    expect(isPanelDrawable(stale)).toBe(true);
  });

  test('the server reasons for a halted simulation reach the panel with the server sentence', () => {
    for (const reason of ['stalled', 'waiting_for_data', 'read_failed']) {
      const state = judge({
        projection: currentOf({
          status: 'unavailable',
          reason,
          message: `Sem previsão: ${reason}`,
        }),
      });
      expect(state).toMatchObject({
        kind: 'unavailable',
        reason,
        message: `Sem previsão: ${reason}`,
      });
    }
  });

  test('another candle on screen explains it with the literal sentence, before anything else', () => {
    const state = judge({ isStrategyTimeframe: false, projection: undefined, isError: true });
    expect(state).toStrictEqual({
      kind: 'unavailable',
      reason: 'other_timeframe',
      message: 'A estratégia decide em velas de 1 h; troque para 1h para ver a previsão.',
    });
    expect(isPanelDrawable(state)).toBe(false);
    expect(judge({ isStrategyTimeframe: false, runTimeframe: '4h' })).toMatchObject({
      message: 'A estratégia decide em velas de 4 h; troque para 4h para ver a previsão.',
    });
  });

  test('without an answer yet it is loading, or an error when the request failed', () => {
    expect(judge({ projection: undefined })).toStrictEqual({ kind: 'loading' });
    expect(judge({ projection: undefined, isError: true })).toStrictEqual({ kind: 'error' });
  });

  test('a stopped price wins over a trend and over the server reason', () => {
    const live = { status: 'no_data', secondsWithoutData: 12 } as const;
    const stalled = {
      kind: 'unavailable',
      reason: 'price_stalled',
      message: 'O preço ao vivo parou de chegar; a previsão volta quando ele voltar.',
    } as const;
    expect(judge({ live })).toStrictEqual(stalled);
    const neutral = {
      status: 'unavailable',
      reason: 'neutral',
      message: 'O placar está em 0.',
    } as const;
    expect(judge({ live, projection: neutral })).toStrictEqual(stalled);
  });

  test('each reason the server gives keeps the server sentence, with no band and nothing drawn as a trend', () => {
    const reasons = ['neutral', 'warming_up', 'no_candle', 'not_running'] as const;
    for (const reason of reasons) {
      const projection = { status: 'unavailable', reason, message: `frase ${reason}` } as const;
      const state = judge({ projection });
      expect(state).toStrictEqual({ kind: 'unavailable', reason, message: `frase ${reason}` });
      expect(isPanelDrawable(state)).toBe(true);
    }
  });

  test('the sentences are the literal catalogue', () => {
    expect(NEXT_CANDLE_TEXT.PRICE_STALLED).toBe(
      'O preço ao vivo parou de chegar; a previsão volta quando ele voltar.',
    );
    expect(NEXT_CANDLE_TEXT.PROMISE_TITLE).toBe('Tendência, não promessa.');
  });
});

describe('o tempo até a decisão', () => {
  test('remaining time rounds up and speaks in minutes, then hours', () => {
    expect(formatRemaining(15 * MINUTE)).toBe('15 min');
    expect(formatRemaining(1)).toBe('1 min');
    expect(formatRemaining(59 * MINUTE + 1)).toBe('1 h');
    expect(formatRemaining(125 * MINUTE)).toBe('2 h 5 min');
  });

  test('the horizon line names the decision time in the user time zone', () => {
    const endsAt = FIRST_CANDLE_TIME + 2 * HOUR_MILLISECONDS;
    const zone = 'America/Sao_Paulo';
    expect(describeHorizon({ now: endsAt - 15 * MINUTE, endsAt, timeZone: zone })).toBe(
      'Próximos 15 min (até a decisão das 05:00)',
    );
    expect(describeHorizon({ now: endsAt - 195 * MINUTE, endsAt, timeZone: zone })).toBe(
      'Próximos 3 h 15 min (até a decisão das 05:00)',
    );
    expect(describeHorizon({ now: endsAt, endsAt, timeZone: zone })).toBe(
      'Fechando agora (decisão das 05:00)',
    );
    expect(
      describeHorizon({ now: endsAt - 15 * MINUTE, endsAt, timeZone: 'America/New_York' }),
    ).toBe('Próximos 15 min (até a decisão das 04:00)');
  });

  test('the window follows the server when there is a trend and the clock candle otherwise', () => {
    const available = judge();
    expect(computePanelWindow(available, HOUR_MILLISECONDS, 0)).toStrictEqual({
      start: FIRST_CANDLE_TIME + HOUR_MILLISECONDS,
      end: FIRST_CANDLE_TIME + 2 * HOUR_MILLISECONDS,
    });
    const neutral = judge({
      projection: { status: 'unavailable', reason: 'neutral', message: 'x' },
    });
    const now = FIRST_CANDLE_TIME + 90 * MINUTE;
    expect(computePanelWindow(neutral, HOUR_MILLISECONDS, now)).toStrictEqual({
      start: FIRST_CANDLE_TIME + HOUR_MILLISECONDS,
      end: FIRST_CANDLE_TIME + 2 * HOUR_MILLISECONDS,
    });
    expect(computePanelWindow(neutral, 0, now)).toBeUndefined();
  });
});

describe('a linha do preço real chegando', () => {
  const message = { openTime: 1_000, at: 1_500, close: '12.9' };

  test('a new candle starts a new line and each newer message adds one point', () => {
    const first = extendTrail(EMPTY_TRAIL, message);
    expect(first.points).toStrictEqual([{ at: 1_500, close: '12.9' }]);
    const second = extendTrail(first, { ...message, at: 2_500, close: '13' });
    expect(second.points.map((point) => point.close)).toStrictEqual(['12.9', '13']);
    const next = extendTrail(second, { openTime: 9_000, at: 9_100, close: '14' });
    expect(next.points).toStrictEqual([{ at: 9_100, close: '14' }]);
  });

  test('a repeated or older message returns the same object, so nothing re-renders', () => {
    const first = extendTrail(EMPTY_TRAIL, message);
    expect(extendTrail(first, message)).toBe(first);
    expect(extendTrail(first, { ...message, at: 1_000 })).toBe(first);
  });

  test('only the newest points are kept', () => {
    let trail = EMPTY_TRAIL;
    for (let index = 0; index < MAX_TRAIL_POINTS + 5; index += 1) {
      trail = extendTrail(trail, { ...message, at: 1_000 + index });
    }
    expect(trail.points).toHaveLength(MAX_TRAIL_POINTS);
    expect(trail.points[0]?.at).toBe(1_005);
  });
});

describe('o resultado da previsão anterior (RF17)', () => {
  function item(overrides: Record<string, unknown>): ProjectionItem {
    const parsed = projectionsSchema.parse(
      buildProjectionsResponse({ items: [buildProjectionItem(overrides)] }),
    );
    const first = parsed.items[0];
    if (first === undefined) throw new Error('item');
    return first;
  }

  test('a hit and a miss say what the price did and whether it stayed in the band', () => {
    expect(
      describeResult(
        item({ result: 'hit', moveRate: '0.0027', isInside: true, nextClose: '12.94' }),
      ),
    ).toStrictEqual({
      tone: 'hit',
      word: 'Acertou',
      text: 'Acertou: o preço subiu 0,27% — ficou dentro da faixa.',
    });
    expect(
      describeResult(item({ result: 'miss', moveRate: '-0.0027', isInside: false })),
    ).toMatchObject({ text: 'Errou: o preço caiu 0,27% — ficou fora da faixa.' });
  });

  test('a move too small for the second decimal says so instead of "0,00%"', () => {
    expect(describeResult(item({ result: 'hit', moveRate: '0.00004', isInside: true }))?.text).toBe(
      'Acertou: o preço subiu menos de 0,01% — ficou dentro da faixa.',
    );
    expect(
      describeResult(item({ result: 'miss', moveRate: '-0.00004', isInside: false }))?.text,
    ).toBe('Errou: o preço caiu menos de 0,01% — ficou fora da faixa.');
  });

  test('a tie does not count, and pending, no side and a missing candle show nothing', () => {
    expect(describeResult(item({ result: 'tie', moveRate: '0' }))?.text).toBe(
      'Empatou: o preço fechou igual e esta previsão não conta.',
    );
    for (const result of ['pending', 'no_side', 'gap']) {
      expect(describeResult(item({ result }))).toBeUndefined();
    }
  });

  test('only the two newest predictions are looked at', () => {
    const resolved = item({ result: 'hit', moveRate: '0.01', isInside: true });
    const pending = item({ result: 'pending' });
    expect(findRecentResult([pending, resolved])?.tone).toBe('hit');
    expect(findRecentResult([pending, pending, resolved])).toBeUndefined();
    expect(findRecentResult([])).toBeUndefined();
  });
});

describe('borda da faixa', () => {
  test('the lower edge goes down and the upper edge goes up at the price scale', () => {
    expect(formatPriceEdge('12.77851', 'low')).toBe('12,7785');
    expect(formatPriceEdge('12.77851', 'high')).toBe('12,7786');
    expect(formatPriceEdge('61700.126', 'low')).toBe('61.700,12');
    expect(formatPriceEdge('61700.121', 'high')).toBe('61.700,13');
    expect(formatPriceEdge('0.00001234', 'low')).toBe('0,00001234');
    expect(formatPriceEdge('13.0000', 'high')).toBe('13,00');
  });
});

describe('porcentagem do servidor', () => {
  test('a rate moves the comma two places without recomputing it', () => {
    expect(formatRatePercent('0.4942')).toBe('49,42%');
    expect(formatRatePercent('0.5')).toBe('50,00%');
    expect(formatRatePercent(null)).toBe('—');
    // Os limites de Wilson arredondam para fora: o de baixo desce, o de cima sobe (nunca "50,00%" de um 49,9961).
    expect(formatIntervalLimitPercent('0.499961', 'lower')).toBe('49,99%');
    expect(formatIntervalLimitPercent('0.499951', 'upper')).toBe('50,00%');
    expect(formatIntervalLimitPercent('0.4999', 'lower')).toBe('49,99%');
    expect(formatIntervalLimitPercent('0.5', 'upper')).toBe('50,00%');
    expect(formatIntervalLimitPercent('x', 'upper')).toBe('—');
    expect(ratePercentAttribute('0.4942')).toBe('49.42000000');
    expect(ratePercentAttribute(null)).toBe('0');
  });
});
