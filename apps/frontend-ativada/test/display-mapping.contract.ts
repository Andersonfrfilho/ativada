// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  bucketOf,
  createDisplayMapping,
  decidedOpenAt,
  expandLayers,
  listExitBrackets,
  opinionWindowAt,
  slotOpens,
  waitedOpens,
} from '../src/runs/candle-chart/display-mapping.js';
import type { StrategyLayers } from '../src/runs/candle-chart/strategy-layers.validation.js';
import type { Trade } from '../src/runs/run.validation.js';

const MINUTE = 60_000;
const RUN = 15 * MINUTE;
const SHOWN = 3 * MINUTE;
const MAPPING = { runMilliseconds: RUN, displayMilliseconds: SHOWN };

function same<TValue>(value: TValue): TValue[] {
  return Array.from({ length: 5 }, () => value);
}

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function layersFor(times: readonly number[]): StrategyLayers {
  return {
    version: 'layers-1',
    timeframe: '15m',
    from: times[0] ?? 0,
    to: (times.at(-1) ?? 0) + RUN,
    candleTimes: [...times],
    score: times.map((_time, index) => `${index}.00000000`),
    actions: times.map(() => 'HOLD'),
    atr: times.map(() => null),
    lines: [
      {
        key: 'ema',
        ruleId: 'r',
        role: 'ema_fast',
        label: 'EMA',
        values: times.map((_t, i) => (i === 0 ? null : `${i}.50000000`)),
      },
    ],
    thresholds: [
      { from: times[0] ?? 0, to: times.at(-1) ?? 0, buy: '2.00000000', sell: '-2.00000000' },
    ],
  };
}

describe('mapeamento da vela de 15 min para a de 3 min', () => {
  test('só existe quando a vela mostrada é menor e divide a da execução', () => {
    expect(createDisplayMapping(RUN, SHOWN)).toEqual(MAPPING);
    expect(createDisplayMapping(RUN, RUN)).toBeUndefined();
    expect(createDisplayMapping(RUN, 4 * RUN)).toBeUndefined();
    expect(createDisplayMapping(RUN, 4 * MINUTE)).toBeUndefined();
    expect(createDisplayMapping(RUN, undefined)).toBeUndefined();
  });

  test('2.000 sorteios: a opinião nunca começa antes do fechamento da vela decidida e ocupa 5 velas', () => {
    const next = seeded(11);
    for (let draw = 0; draw < 2_000; draw += 1) {
      const decided = bucketOf(Math.floor(next() * 1_900_000_000_000), RUN);
      const opens = slotOpens(decided, MAPPING);
      expect(opens).toHaveLength(5);
      expect(opens[0]).toBe(decided + RUN);
      expect(opens.every((open) => open >= decided + RUN && open < decided + 2 * RUN)).toBe(true);
      expect(opens.every((open) => open % SHOWN === 0)).toBe(true);
    }
  });

  test('2.000 sorteios: toda vela mostrada sabe qual opinião valia nela', () => {
    const next = seeded(23);
    for (let draw = 0; draw < 2_000; draw += 1) {
      const shown = bucketOf(Math.floor(next() * 1_900_000_000_000), SHOWN);
      const window = opinionWindowAt(shown, MAPPING);
      expect(shown >= window.issuedAt && shown < window.validUntil).toBe(true);
      expect(slotOpens(decidedOpenAt(shown, MAPPING), MAPPING)).toContain(shown);
    }
  });

  test('o placar e as linhas viram degraus sobre as 5 velas, deslocados para quando valeram', () => {
    const times = [0, RUN, 2 * RUN];
    const expanded = expandLayers(layersFor(times), MAPPING);
    expect(expanded.candleTimes).toHaveLength(15);
    expect(expanded.candleTimes[0]).toBe(RUN);
    expect(expanded.candleTimes.at(-1)).toBe(3 * RUN + 4 * SHOWN);
    expect(expanded.score.slice(0, 5)).toEqual(same('0.00000000'));
    expect(expanded.score.slice(5, 10)).toEqual(same('1.00000000'));
    expect(expanded.lines[0]?.values.slice(0, 5)).toEqual(same(null));
    expect(expanded.lines[0]?.values.slice(5, 10)).toEqual(same('1.50000000'));
    expect(expanded.thresholds[0]).toMatchObject({ from: RUN, to: 3 * RUN + 4 * SHOWN });
  });

  test('esperou: o ponto cai na primeira vela em que a decisão já existia', () => {
    expect(waitedOpens([0, RUN], MAPPING)).toEqual([RUN, 2 * RUN]);
  });

  test('saída por alvo ou proteção: colchete sobre as 5 velas da vela de 15 min; saída por sinal não tem', () => {
    const base = { status: 'closed', entryPrice: '1', quantity: '1', openedCandleTime: 0 } as const;
    const trades: Trade[] = [
      { ...base, engineKey: 'a', exitReason: 'stop', closedCandleTime: 4 * RUN },
      { ...base, engineKey: 'b', exitReason: 'signal', closedCandleTime: 5 * RUN },
      { ...base, engineKey: 'c', exitReason: 'target', closedCandleTime: 6 * RUN + SHOWN },
    ];
    const brackets = listExitBrackets(trades, MAPPING);
    expect(brackets.map((bracket) => bracket.positionKey)).toEqual(['a', 'c']);
    expect(brackets[0]).toMatchObject({
      firstOpen: 4 * RUN,
      lastOpen: 4 * RUN + 4 * SHOWN,
      to: 5 * RUN,
    });
    expect(brackets[1]).toMatchObject({ firstOpen: 6 * RUN, from: 6 * RUN });
  });
});

describe('a visão de 15 min continua idêntica à da spec 009', () => {
  test('sem mapeamento nada é reposicionado: as camadas saem exatamente como chegaram', () => {
    const times = [0, RUN, 2 * RUN];
    const layers = layersFor(times);
    const mapping = createDisplayMapping(RUN, RUN);
    expect(mapping).toBeUndefined();
    expect(layers.candleTimes).toEqual(times);
  });
});
