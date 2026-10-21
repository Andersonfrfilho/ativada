// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { composeCandles, pickWindowCandles } from '../src/runs/candle-chart/compose-candles.js';
import type { MarketCandle } from '../src/runs/candle-chart/market-candles.validation.js';

// Oráculo independente (spec 017, ADR 0002 V9): negócios sorteados viram a vela de 15 min DIRETO, e as de 3 min pela
// definição da corretora (vela sem negócio repete o fechamento anterior, volume 0). O compositor tem de dar a mesma vela.
const SCALE = 100_000_000n;
const MINUTE = 60_000;
const SLOT = 3 * MINUTE;
const WINDOW_OPEN = 1_700_000_100_000 - (1_700_000_100_000 % (15 * MINUTE));

type Trade = { readonly minute: number; readonly price: bigint; readonly quantity: bigint };

function text(value: bigint): string {
  const whole = value / SCALE;
  const fraction = (value % SCALE).toString().padStart(8, '0');
  return `${whole}.${fraction}`;
}

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function candleFromTrades(
  trades: readonly Trade[],
  slot: { readonly openTime: number; readonly minutes: number },
  carried: bigint,
): MarketCandle {
  const { openTime } = slot;
  const prices = trades.map((trade) => trade.price);
  const first = trades[0]?.price ?? carried;
  const last = trades.at(-1)?.price ?? carried;
  const volume = trades.reduce((sum, trade) => sum + trade.quantity, 0n);
  return {
    openTime,
    closeTime: openTime + slot.minutes * MINUTE - 1,
    open: text(first),
    high: text(prices.length === 0 ? carried : prices.reduce((a, b) => (b > a ? b : a))),
    low: text(prices.length === 0 ? carried : prices.reduce((a, b) => (b < a ? b : a))),
    close: text(last),
    volume: text(volume),
    tradeCount: trades.length,
  };
}

function drawTrades(next: () => number): Trade[] {
  const count = Math.floor(next() * 12);
  const trades = Array.from({ length: count }, () => ({
    minute: Math.floor(next() * 15),
    price: BigInt(Math.floor(next() * 1_000_000)) + 1n,
    quantity: BigInt(Math.floor(next() * 5_000)) + 1n,
  }));
  return trades.sort((left, right) => left.minute - right.minute);
}

function build(seed: number, slotMinutes = 3): { small: MarketCandle[]; big: MarketCandle } {
  const next = seeded(seed);
  const trades = drawTrades(next);
  const carried = BigInt(Math.floor(next() * 1_000_000)) + 1n;
  let previous = carried;
  const small = Array.from({ length: 15 / slotMinutes }, (_unused, slot) => {
    const inSlot = trades.filter((trade) => Math.floor(trade.minute / slotMinutes) === slot);
    const openTime = WINDOW_OPEN + slot * slotMinutes * MINUTE;
    const candle = candleFromTrades(inSlot, { openTime, minutes: slotMinutes }, previous);
    previous = inSlot.at(-1)?.price ?? previous;
    return candle;
  });
  const big = candleFromTrades(trades, { openTime: WINDOW_OPEN, minutes: 15 }, carried);
  return { small, big: { ...big, closeTime: WINDOW_OPEN + 15 * MINUTE - 1 } };
}

describe('composição de 15 velas de 1 min em uma de 15 min', () => {
  test('2.000 sorteios: a soma é igual à vela de 15 min feita direto dos negócios', () => {
    for (let seed = 1; seed <= 2_000; seed += 1) {
      const { small, big } = build(seed, 1);
      expect(small).toHaveLength(15);
      const composed = composeCandles(small, { openTime: big.openTime, closeTime: big.closeTime });
      expect(composed).toEqual(big);
    }
  });
});

describe('composição de 5 velas de 3 min em uma de 15 min', () => {
  test('2.000 sorteios: a soma é igual à vela de 15 min feita direto dos negócios', () => {
    for (let seed = 1; seed <= 2_000; seed += 1) {
      const { small, big } = build(seed);
      const composed = composeCandles(small, { openTime: big.openTime, closeTime: big.closeTime });
      expect(composed).toEqual(big);
    }
  });

  test('SHIB: a primeira vela sem negócio carrega o fechamento anterior e não define a abertura', () => {
    const small: MarketCandle[] = [
      {
        openTime: 0,
        closeTime: SLOT - 1,
        open: '0.00001000',
        high: '0.00001000',
        low: '0.00001000',
        close: '0.00001000',
        volume: '0.00000000',
        tradeCount: 0,
      },
      {
        openTime: SLOT,
        closeTime: 2 * SLOT - 1,
        open: '0.00001010',
        high: '0.00001020',
        low: '0.00001005',
        close: '0.00001015',
        volume: '5.00000000',
        tradeCount: 2,
      },
      {
        openTime: 2 * SLOT,
        closeTime: 3 * SLOT - 1,
        open: '0.00001015',
        high: '0.00001030',
        low: '0.00001010',
        close: '0.00001025',
        volume: '7.00000000',
        tradeCount: 3,
      },
      {
        openTime: 3 * SLOT,
        closeTime: 4 * SLOT - 1,
        open: '0.00001025',
        high: '0.00001025',
        low: '0.00001025',
        close: '0.00001025',
        volume: '0.00000000',
        tradeCount: 0,
      },
      {
        openTime: 4 * SLOT,
        closeTime: 5 * SLOT - 1,
        open: '0.00001025',
        high: '0.00001025',
        low: '0.00001025',
        close: '0.00001025',
        volume: '0.00000000',
        tradeCount: 0,
      },
    ];
    const composed = composeCandles(small, { openTime: 0, closeTime: 15 * MINUTE - 1 });
    expect(composed?.open).toBe('0.00001010');
    expect(composed?.high).toBe('0.00001030');
    expect(composed?.low).toBe('0.00001005');
    expect(composed?.close).toBe('0.00001025');
    expect(composed?.volume).toBe('12.00000000');
    expect(composed?.tradeCount).toBe(5);
  });

  test('parcial: uma vela fechada e a em formação já compõem a vela de 15 min em formação', () => {
    const { small } = build(7);
    const composed = composeCandles(small.slice(0, 2), {
      openTime: WINDOW_OPEN,
      closeTime: WINDOW_OPEN + 15 * MINUTE - 1,
    });
    expect(composed?.close).toBe(small[1]?.close ?? '');
  });

  test('sem velas, ou com valor ilegível, não há vela composta', () => {
    const window = { openTime: 0, closeTime: 1 };
    expect(composeCandles([], window)).toBeUndefined();
    const { small } = build(3);
    const broken = small.map((candle, index) =>
      index === 2 ? { ...candle, close: 'abc' } : candle,
    );
    expect(composeCandles(broken, window)).toBeUndefined();
  });

  test('escolhe só as velas de dentro da janela', () => {
    const { small } = build(9);
    const outside: MarketCandle = {
      openTime: WINDOW_OPEN - SLOT,
      closeTime: WINDOW_OPEN - 1,
      open: '1.00000000',
      high: '1.00000000',
      low: '1.00000000',
      close: '1.00000000',
      volume: '0.00000000',
      tradeCount: 0,
    };
    const picked = pickWindowCandles([outside, ...small], {
      openTime: WINDOW_OPEN,
      closeTime: WINDOW_OPEN + 15 * MINUTE - 1,
    });
    expect(picked).toHaveLength(5);
  });
});
