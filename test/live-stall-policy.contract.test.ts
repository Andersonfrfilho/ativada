// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';

const { stallPolicy } = await loadApiApp();
const { computeStalledSince } = stallPolicy;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const GRACE = 15;
// 2026-10-13T00:00:00Z, fronteira de todas as velas.
const MIDNIGHT = Date.UTC(2026, 9, 13);

type Timeframe = '15m' | '1h' | '4h' | '1d';

function compute(overrides: {
  timeframe?: Timeframe;
  lastCandleTime?: number | undefined;
  startedAt?: number;
  now: number;
  waitingForData?: boolean;
  graceMinutes?: number;
}): number | undefined {
  return computeStalledSince({
    timeframe: overrides.timeframe ?? '1h',
    lastCandleTime: overrides.lastCandleTime,
    startedAt: overrides.startedAt ?? MIDNIGHT,
    now: overrides.now,
    graceMinutes: overrides.graceMinutes ?? GRACE,
    waitingForData: overrides.waitingForData ?? false,
  });
}

describe('parada com passo: a próxima vela fecha uma duração depois da última e a carência vem depois', () => {
  // [vela, duração, última aberta, parada esperada]
  const CASES: readonly (readonly [Timeframe, number, number, number])[] = [
    ['15m', 15 * MINUTE, MIDNIGHT + 9 * HOUR, MIDNIGHT + 9 * HOUR + 30 * MINUTE + 15 * MINUTE],
    ['1h', HOUR, MIDNIGHT + 9 * HOUR, MIDNIGHT + 11 * HOUR + 15 * MINUTE],
    ['4h', 4 * HOUR, MIDNIGHT + 8 * HOUR, MIDNIGHT + 16 * HOUR + 15 * MINUTE],
    ['1d', DAY, MIDNIGHT, MIDNIGHT + 2 * DAY + 15 * MINUTE],
  ];

  for (const [timeframe, , lastCandleTime, expected] of CASES) {
    test(`${timeframe}: um instante antes do limite está em dia, no limite exato começa o episódio`, () => {
      expect(compute({ timeframe, lastCandleTime, now: expected - 1 })).toBeUndefined();
      expect(compute({ timeframe, lastCandleTime, now: expected })).toBe(expected);
    });

    test(`${timeframe}: o início é o mesmo quando a varredura chega horas depois`, () => {
      expect(compute({ timeframe, lastCandleTime, now: expected + 7 * HOUR })).toBe(expected);
    });
  }
});

describe('parada sem passo: vale a vela que estava em curso na criação', () => {
  const CASES: readonly (readonly [Timeframe, number, number])[] = [
    // criada 10:07 -> vela 10:00 fecha 11:00 -> parada 11:15
    ['1h', MIDNIGHT + 10 * HOUR + 7 * MINUTE, MIDNIGHT + 11 * HOUR + 15 * MINUTE],
    // criada 10:07 -> vela 10:00 fecha 10:15 -> parada 10:30
    ['15m', MIDNIGHT + 10 * HOUR + 7 * MINUTE, MIDNIGHT + 10 * HOUR + 30 * MINUTE],
    // criada 10:07 -> vela 08:00 fecha 12:00 -> parada 12:15
    ['4h', MIDNIGHT + 10 * HOUR + 7 * MINUTE, MIDNIGHT + 12 * HOUR + 15 * MINUTE],
    // criada 10:07 -> vela do dia fecha 00:00 do dia seguinte -> parada 00:15
    ['1d', MIDNIGHT + 10 * HOUR + 7 * MINUTE, MIDNIGHT + DAY + 15 * MINUTE],
  ];

  for (const [timeframe, startedAt, expected] of CASES) {
    test(`${timeframe}: sem passo a parada começa na carência depois do fechamento da vela em curso`, () => {
      expect(compute({ timeframe, startedAt, now: expected - 1 })).toBeUndefined();
      expect(compute({ timeframe, startedAt, now: expected })).toBe(expected);
    });
  }

  test('criada exatamente na abertura da vela, a vela em curso é essa mesma', () => {
    expect(
      compute({
        timeframe: '1h',
        startedAt: MIDNIGHT + 10 * HOUR,
        now: MIDNIGHT + 11 * HOUR + 15 * MINUTE,
      }),
    ).toBe(MIDNIGHT + 11 * HOUR + 15 * MINUTE);
  });
});

describe('exceções e propriedades da regra', () => {
  test('espera por dado não é parada, por mais atrasada que esteja', () => {
    expect(
      compute({ lastCandleTime: MIDNIGHT, now: MIDNIGHT + 30 * DAY, waitingForData: true }),
    ).toBeUndefined();
  });

  test('a carência vem do parâmetro', () => {
    const last = MIDNIGHT + 9 * HOUR;
    expect(
      compute({ lastCandleTime: last, graceMinutes: 5, now: last + 2 * HOUR + 5 * MINUTE }),
    ).toBe(last + 2 * HOUR + 5 * MINUTE);
    expect(
      compute({ lastCandleTime: last, graceMinutes: 240, now: last + 2 * HOUR + 5 * MINUTE }),
    ).toBeUndefined();
  });

  test('propriedade: nunca antes do fim da vela devida mais a carência e igual para o mesmo estado, em 2.000 casos', () => {
    let seed = 12_345;
    const next = (limit: number): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % limit;
    };
    const frames: readonly Timeframe[] = ['15m', '1h', '4h', '1d'];
    const durations = { '15m': 15 * MINUTE, '1h': HOUR, '4h': 4 * HOUR, '1d': DAY };
    for (let index = 0; index < 2_000; index += 1) {
      const timeframe = frames[next(4)] ?? '1h';
      const duration = durations[timeframe];
      const lastCandleTime = MIDNIGHT + next(400) * duration;
      const now = lastCandleTime + next(40 * 96) * 15 * MINUTE;
      const params = { timeframe, lastCandleTime, now };
      const first = compute(params);
      expect(compute(params)).toBe(first);
      const floor = lastCandleTime + 2 * duration + GRACE * MINUTE;
      if (first === undefined) expect(now).toBeLessThan(floor);
      else {
        expect(first).toBe(floor);
        expect(now).toBeGreaterThanOrEqual(first);
      }
    }
  });
});
