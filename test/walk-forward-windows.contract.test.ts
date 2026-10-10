// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createRandom,
  loadWalkForwardEngineApi,
  pickInteger,
} from './fixtures/walk-forward/walk-forward-api.fixture.js';

const { addUtcMonths, planWalkForwardWindows, WALK_FORWARD_ERROR_CODE, WalkForwardError } =
  await loadWalkForwardEngineApi();

const HOUR = 3_600_000;
const PROPERTY_CASES = 1_200;

function utc(year: number, month: number, day = 1, hour = 0): number {
  return Date.UTC(year, month - 1, day, hour);
}

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error: unknown) {
    return error instanceof WalkForwardError ? error.code : 'OTHER';
  }
  return undefined;
}

describe('meses de calendário em UTC', () => {
  test('mantém o instante do dia e vira o ano', () => {
    const start = Date.UTC(2024, 10, 15, 13, 45, 10, 123);
    expect(addUtcMonths(start, 3)).toBe(Date.UTC(2025, 1, 15, 13, 45, 10, 123));
    expect(addUtcMonths(start, 0)).toBe(start);
    expect(addUtcMonths(start, 25)).toBe(Date.UTC(2026, 11, 15, 13, 45, 10, 123));
  });

  test('o dia que não existe no mês de destino vai para o último dia dele', () => {
    expect(addUtcMonths(utc(2024, 1, 31), 1)).toBe(utc(2024, 2, 29));
    expect(addUtcMonths(utc(2025, 1, 31), 1)).toBe(utc(2025, 2, 28));
    expect(addUtcMonths(utc(2024, 3, 31), 1)).toBe(utc(2024, 4, 30));
  });

  test('instantes anteriores a 1970 também andam em meses inteiros', () => {
    expect(addUtcMonths(Date.UTC(1969, 11, 31), 2)).toBe(Date.UTC(1970, 1, 28));
  });
});

describe('janelas 6/2/2 em meses de calendário', () => {
  const windows = planWalkForwardWindows({ start: utc(2024, 1), end: utc(2025, 1) });

  test('um ano dá exatamente três janelas, com as datas à mão', () => {
    expect(windows).toEqual([
      {
        index: 0,
        trainStart: utc(2024, 1),
        trainEnd: utc(2024, 7),
        testStart: utc(2024, 7),
        testEnd: utc(2024, 9),
        trainLeadInStart: utc(2024, 1),
        testLeadInStart: utc(2024, 7),
      },
      {
        index: 1,
        trainStart: utc(2024, 3),
        trainEnd: utc(2024, 9),
        testStart: utc(2024, 9),
        testEnd: utc(2024, 11),
        trainLeadInStart: utc(2024, 3),
        testLeadInStart: utc(2024, 9),
      },
      {
        index: 2,
        trainStart: utc(2024, 5),
        trainEnd: utc(2024, 11),
        testStart: utc(2024, 11),
        testEnd: utc(2025, 1),
        trainLeadInStart: utc(2024, 5),
        testLeadInStart: utc(2024, 11),
      },
    ]);
  });

  test('um dia a menos de período e o plano recusa: só duas janelas cabem', () => {
    const run = (): unknown =>
      planWalkForwardWindows({ start: utc(2024, 1), end: utc(2024, 12, 31) });
    expect(codeOf(run)).toBe(WALK_FORWARD_ERROR_CODE.PERIOD_TOO_SHORT);
    try {
      run();
    } catch (error: unknown) {
      expect(error instanceof WalkForwardError && error.details).toEqual({
        windows: 2,
        requiredWindows: 3,
      });
    }
  });

  test('o fim do período é exclusivo: o teste pode terminar exatamente nele', () => {
    const exact = planWalkForwardWindows({ start: utc(2024, 1), end: utc(2025, 1) });
    expect(exact.at(-1)?.testEnd).toBe(utc(2025, 1));
  });

  test('o aquecimento vem ANTES do início do ajuste e do teste', () => {
    const [first] = planWalkForwardWindows({
      start: utc(2024, 1),
      end: utc(2025, 1),
      leadInCandles: 194,
      candleMilliseconds: HOUR,
    });
    expect(first?.trainLeadInStart).toBe(utc(2024, 1) - 194 * HOUR);
    expect(first?.testLeadInStart).toBe(utc(2024, 7) - 194 * HOUR);
  });

  test('o padrão 6/2/2 é o mesmo que passar os valores', () => {
    expect(
      planWalkForwardWindows({
        start: utc(2024, 1),
        end: utc(2025, 1),
        trainMonths: 6,
        testMonths: 2,
        stepMonths: 2,
      }),
    ).toEqual(windows);
  });
});

describe('configuração inválida', () => {
  const base = { start: utc(2024, 1), end: utc(2026, 1) };

  test.each([
    ['passo menor que o teste (testes sobrepostos)', { stepMonths: 1 }],
    ['ajuste zero', { trainMonths: 0 }],
    ['teste negativo', { testMonths: -2 }],
    ['meses fracionários', { trainMonths: 2.5 }],
    ['meses em excesso', { trainMonths: 5_000 }],
  ])('%s', (_name, override) => {
    expect(codeOf(() => planWalkForwardWindows({ ...base, ...override }))).toBe(
      WALK_FORWARD_ERROR_CODE.INVALID_WINDOW_CONFIG,
    );
  });

  test.each([
    ['começo depois do fim', { start: utc(2025, 1), end: utc(2024, 1) }],
    ['período vazio', { start: utc(2024, 1), end: utc(2024, 1) }],
    ['instante fracionário', { start: 1.5, end: utc(2024, 1) }],
  ])('%s', (_name, override) => {
    expect(codeOf(() => planWalkForwardWindows({ ...base, ...override }))).toBe(
      WALK_FORWARD_ERROR_CODE.INVALID_WINDOW_CONFIG,
    );
  });
});

describe('propriedades sobre períodos aleatórios', () => {
  test(`${PROPERTY_CASES} períodos: janelas disjuntas, ordenadas, determinísticas e ao menos três`, () => {
    const random = createRandom(20_261_013);
    let planned = 0;
    for (let index = 0; index < PROPERTY_CASES; index += 1) {
      const start =
        utc(2018, 1) +
        pickInteger(random, 0, 2_000) * 86_400_000 +
        pickInteger(random, 0, 86_399_999);
      const testMonths = pickInteger(random, 1, 6);
      const params = {
        start,
        end: addUtcMonths(start, pickInteger(random, 6, 90)),
        trainMonths: pickInteger(random, 1, 12),
        testMonths,
        stepMonths: testMonths + pickInteger(random, 0, 3),
      };
      let windows: ReturnType<typeof planWalkForwardWindows>;
      try {
        windows = planWalkForwardWindows(params);
      } catch (error: unknown) {
        expect(error instanceof WalkForwardError).toBe(true);
        expect(error instanceof WalkForwardError && error.code).toBe(
          WALK_FORWARD_ERROR_CODE.PERIOD_TOO_SHORT,
        );
        continue;
      }
      planned += 1;
      expect(windows.length).toBeGreaterThanOrEqual(3);
      expect(planWalkForwardWindows(params)).toEqual(windows);
      windows.forEach((window, position) => {
        expect(window.index).toBe(position);
        expect(window.trainStart).toBeLessThan(window.trainEnd);
        expect(window.trainEnd).toBe(window.testStart);
        expect(window.testStart).toBeLessThan(window.testEnd);
        expect(window.trainStart).toBeGreaterThanOrEqual(params.start);
        expect(window.testEnd).toBeLessThanOrEqual(params.end);
        const next = windows[position + 1];
        if (next === undefined) return;
        expect(next.trainStart).toBeGreaterThan(window.trainStart);
        expect(next.testStart).toBeGreaterThanOrEqual(window.testEnd);
      });
    }
    expect(planned).toBeGreaterThan(PROPERTY_CASES / 4);
  });
});
