// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type {
  BalanceSurvival,
  SurvivalPoint,
  SurvivalSettings,
} from '../packages/strategy-engine/src/survival/survival.types.js';
import { createSeededRandom } from './fixtures/backtest/synthetic-candles.fixture.js';
import { loadSurvivalApi } from './fixtures/strategy-engine/survival/survival-api.fixture.js';
import {
  formatProgress,
  formatScaled,
  parseScaled,
  runOracle,
  type OraclePoint,
} from './fixtures/strategy-engine/survival/survival-oracle.fixture.js';

const HOUR = 3_600_000;
const START = 10 * HOUR;
const DEFAULTS: SurvivalSettings = { floorRate: '0.8', doubleRate: '2' };
const INITIAL = '10000';
const SECRET_FRAGMENT = 'ValorQueNaoPodeVazar';

const api = await loadSurvivalApi();

function point(offset: number, equity: string, equityAtLow: string): SurvivalPoint {
  return { candleOpenTime: START + offset * HOUR, equity, equityAtLow };
}

function survive(
  points: readonly SurvivalPoint[],
  overrides: Partial<{
    initialBalance: string;
    settings: SurvivalSettings;
    durationMilliseconds: number;
    startTime: number;
  }> = {},
): BalanceSurvival {
  return api.computeBalanceSurvival({
    initialBalance: overrides.initialBalance ?? INITIAL,
    startTime: overrides.startTime ?? START,
    durationMilliseconds: overrides.durationMilliseconds ?? HOUR,
    settings: overrides.settings ?? DEFAULTS,
    points,
  });
}

function codeOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error: unknown) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe('piso e meta de dobro: a tabela de níveis (contas à mão, arredondamento contra o usuário)', () => {
  test.each([
    ['10000', '0.8', '2', '8000', '20000'],
    ['100.00000001', '0.8', '2', '80.00000001', '200.00000002'],
    ['0.00000003', '0.8', '2', '0.00000003', '0.00000006'],
    ['10.12345678', '0.8333', '1.3333', '8.43587654', '13.49760493'],
    ['1000', '0.95', '1.5', '950', '1500'],
    ['250.5', '0.1', '10', '25.05', '2505'],
  ])(
    'saldo %s, piso %s, dobro %s -> piso %s e meta %s',
    (initial, floorRate, doubleRate, floor, target) => {
      const result = survive([], { initialBalance: initial, settings: { floorRate, doubleRate } });
      expect(result.floor.level).toBe(floor);
      expect(result.double.level).toBe(target);
      expect(result.initialBalance).toBe(initial);
    },
  );

  test('a meta e o piso são arredondados PARA CIMA (o piso fica mais alto, a meta mais difícil)', () => {
    const result = survive([], {
      initialBalance: '10.12345678',
      settings: { floorRate: '0.8333', doubleRate: '1.3333' },
    });
    expect(result.floor.level).toBe('8.43587654');
    expect(result.double.level).toBe('13.49760493');
  });
});

describe('marcos: quando o piso e o dobro são atingidos', () => {
  test('nenhum dos dois: tempos nulos e o progresso de cada um', () => {
    const result = survive([
      point(0, '10050', '9900'),
      point(1, '10300', '9950'),
      point(2, '10200', '9000'),
      point(3, '12500', '11000'),
    ]);
    expect(result.floor).toStrictEqual({
      level: '8000',
      isReached: false,
      reachedAtCandleTime: null,
      elapsedMilliseconds: null,
      progress: '0.5',
    });
    expect(result.double).toStrictEqual({
      level: '20000',
      isReached: false,
      reachedAtCandleTime: null,
      elapsedMilliseconds: null,
      progress: '0.25',
    });
    expect(result.lowestEquity).toBe('9000');
    expect(result.highestEquity).toBe('12500');
    expect(result.observedUntilCandleTime).toBe(START + 3 * HOUR);
    expect(result.observedMilliseconds).toBe(4 * HOUR);
  });

  test('tocar o piso já vale (<=): o tempo vai do início ao FECHAMENTO do candle', () => {
    const result = survive([point(0, '9000', '8500'), point(1, '8100', '8000')]);
    expect(result.floor).toMatchObject({
      isReached: true,
      reachedAtCandleTime: START + HOUR,
      elapsedMilliseconds: 2 * HOUR,
      progress: '1',
    });
    expect(result.double.isReached).toBe(false);
  });

  test('um centavo acima do piso não é atingi­do', () => {
    const result = survive([point(0, '8500', '8000.00000001')]);
    expect(result.floor.isReached).toBe(false);
    expect(result.floor.elapsedMilliseconds).toBeNull();
  });

  test('o piso olha o VALE do candle (equityAtLow), não o fechamento', () => {
    const result = survive([point(0, '9500', '7900')]);
    expect(result.floor).toMatchObject({
      isReached: true,
      reachedAtCandleTime: START,
      elapsedMilliseconds: HOUR,
    });
  });

  test('o dobro olha o FECHAMENTO (equity), não o vale nem a máxima', () => {
    const missing = survive([point(0, '10000', '10000'), point(1, '19999.99999999', '19000')]);
    expect(missing.double.isReached).toBe(false);
    const reached = survive([
      point(0, '10000', '10000'),
      point(1, '19999.99999999', '19000'),
      point(2, '20000', '19500'),
    ]);
    expect(reached.double).toMatchObject({
      isReached: true,
      reachedAtCandleTime: START + 2 * HOUR,
      elapsedMilliseconds: 3 * HOUR,
      progress: '1',
    });
    expect(reached.floor.isReached).toBe(false);
  });

  test('os dois, em qualquer ordem: cada um guarda a PRIMEIRA vez, e um marco atingido nunca é desfeito', () => {
    const floorFirst = survive([
      point(1, '9000', '7900'),
      point(2, '9500', '9000'),
      point(3, '8000', '7000'),
      point(5, '21000', '20500'),
      point(6, '9000', '8000'),
    ]);
    expect(floorFirst.floor).toMatchObject({
      reachedAtCandleTime: START + HOUR,
      elapsedMilliseconds: 2 * HOUR,
    });
    expect(floorFirst.double).toMatchObject({
      reachedAtCandleTime: START + 5 * HOUR,
      elapsedMilliseconds: 6 * HOUR,
    });
    const doubleFirst = survive([point(0, '20000', '19000'), point(1, '9000', '7000')]);
    expect(doubleFirst.double.elapsedMilliseconds).toBe(HOUR);
    expect(doubleFirst.floor.elapsedMilliseconds).toBe(2 * HOUR);
  });

  test('o tempo usa o timeframe: candles de 4 h', () => {
    const fourHours = 4 * HOUR;
    const result = survive(
      [
        { candleOpenTime: START, equity: '9000', equityAtLow: '8500' },
        { candleOpenTime: START + 2 * fourHours, equity: '8000', equityAtLow: '7900' },
      ],
      { durationMilliseconds: fourHours },
    );
    expect(result.floor.elapsedMilliseconds).toBe(3 * fourHours);
    expect(result.observedMilliseconds).toBe(3 * fourHours);
  });

  test('candle de antes do início (aquecimento) não conta', () => {
    const result = survive([
      { candleOpenTime: START - HOUR, equity: '99999', equityAtLow: '1' },
      point(0, '10100', '10000'),
    ]);
    expect(result.floor.isReached).toBe(false);
    expect(result.double.isReached).toBe(false);
    expect(result.lowestEquity).toBe('10000');
    expect(result.highestEquity).toBe('10100');
    expect(result.observedMilliseconds).toBe(HOUR);
  });

  test('sem pontos: nada observado, progresso zero', () => {
    const result = survive([]);
    expect(result.floor).toMatchObject({
      isReached: false,
      progress: '0',
      elapsedMilliseconds: null,
    });
    expect(result.double).toMatchObject({
      isReached: false,
      progress: '0',
      elapsedMilliseconds: null,
    });
    expect(result.lowestEquity).toBeNull();
    expect(result.highestEquity).toBeNull();
    expect(result.observedUntilCandleTime).toBeNull();
    expect(result.observedMilliseconds).toBe(0);
  });

  test('acima do saldo inicial o piso não foi tocado e abaixo dele o dobro não andou: progresso zero, nunca negativo', () => {
    const above = survive([point(0, '10500', '10200')]);
    expect(above.floor.progress).toBe('0');
    const below = survive([point(0, '9500', '9000')]);
    expect(below.double.progress).toBe('0');
  });
});

describe('progresso: contra o usuário e só chega a 1 quando o marco é atingido', () => {
  test('o consumo do piso arredonda PARA CIMA e o ganho do dobro PARA BAIXO', () => {
    const result = survive([point(0, '13333.33333333', '9333.33333333')]);
    expect(result.floor.progress).toBe('0.3334');
    expect(result.double.progress).toBe('0.3333');
  });

  test('quase no piso sem tocá-lo: 0.9999, nunca 1', () => {
    const result = survive([point(0, '9000', '8000.00000001')]);
    expect(result.floor.isReached).toBe(false);
    expect(result.floor.progress).toBe('0.9999');
  });

  test('quase no dobro sem chegar: 0.9999, nunca 1', () => {
    const result = survive([point(0, '19999.99999999', '19000')]);
    expect(result.double.isReached).toBe(false);
    expect(result.double.progress).toBe('0.9999');
  });

  test('piso igual ao saldo (saldos de poucos satoshis): sem divisão por zero', () => {
    const result = survive([point(0, '0.00000003', '0.00000003')], {
      initialBalance: '0.00000003',
    });
    expect(result.floor.level).toBe('0.00000003');
    expect(result.floor.isReached).toBe(true);
    expect(result.floor.progress).toBe('1');
  });
});

describe('configuração e entrada', () => {
  test('sem configuração valem os padrões do RF09 (80% e 2×) e a grafia sai canônica', () => {
    expect(api.parseSurvivalSettings(undefined)).toStrictEqual(DEFAULTS);
    expect(api.parseSurvivalSettings({})).toStrictEqual(DEFAULTS);
    expect(api.parseSurvivalSettings({ floorRate: '0.80', doubleRate: '2.0' })).toStrictEqual(
      DEFAULTS,
    );
    expect(api.parseSurvivalSettings({ floorRate: '0.5' })).toStrictEqual({
      floorRate: '0.5',
      doubleRate: '2',
    });
    expect(api.parseSurvivalSettings({ doubleRate: '1.5' })).toStrictEqual({
      floorRate: '0.8',
      doubleRate: '1.5',
    });
  });

  test.each([
    { floorRate: '1' },
    { floorRate: '0' },
    { floorRate: '-0.1' },
    { floorRate: '1.5' },
    { floorRate: '0.12345' },
    { floorRate: '0,8' },
    { floorRate: 0.8 },
    { doubleRate: '1' },
    { doubleRate: '0.5' },
    { doubleRate: '100.5' },
    { doubleRate: '2e1' },
    { unknown: '1' },
  ])('configuração inválida %j: INVALID_SETTINGS', (input) => {
    expect(codeOf(() => api.parseSurvivalSettings(input))).toBe('INVALID_SETTINGS');
  });

  test('o erro aponta os campos inválidos (todos de uma vez) e campo desconhecido vem sem caminho', () => {
    const issuesOf = (input: unknown): readonly string[] => {
      try {
        api.parseSurvivalSettings(input);
      } catch (error: unknown) {
        return (error as { issues: readonly string[] }).issues;
      }
      return [];
    };
    expect(issuesOf({ floorRate: 'x', doubleRate: '1' })).toStrictEqual([
      'floorRate',
      'doubleRate',
    ]);
    expect(issuesOf({ floorRate: '0.9', doubleRate: '0.5' })).toStrictEqual(['doubleRate']);
    expect(issuesOf({ outro: '1' })).toStrictEqual(['']);
  });

  test('o erro nunca repete o valor recebido', () => {
    let message = '';
    try {
      api.parseSurvivalSettings({ floorRate: SECRET_FRAGMENT });
    } catch (error: unknown) {
      message = (error as Error).message;
    }
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toContain(SECRET_FRAGMENT);
  });

  test.each(['0', '-1', 'abc', '1e3', '', '10,5'])(
    'saldo inicial %j: INVALID_INITIAL_BALANCE',
    (initialBalance) => {
      expect(codeOf(() => survive([], { initialBalance }))).toBe('INVALID_INITIAL_BALANCE');
    },
  );

  test.each([
    { startTime: -1 },
    { startTime: 1.5 },
    { durationMilliseconds: 0 },
    { durationMilliseconds: -HOUR },
    { durationMilliseconds: 0.5 },
  ])('tempo %j: INVALID_TIME', (override) => {
    expect(codeOf(() => survive([], override))).toBe('INVALID_TIME');
  });

  test.each([
    point(0, 'x', '1'),
    point(0, '1', '-5'),
    point(0, '1e5', '1'),
    { candleOpenTime: 1.5, equity: '1', equityAtLow: '1' },
    { candleOpenTime: -1, equity: '1', equityAtLow: '1' },
  ])('ponto inválido %j: INVALID_POINT', (invalid) => {
    expect(codeOf(() => survive([invalid]))).toBe('INVALID_POINT');
  });

  test('pontos fora de ordem ou repetidos: POINTS_OUT_OF_ORDER, mesmo antes do início', () => {
    expect(codeOf(() => survive([point(1, '1', '1'), point(0, '1', '1')]))).toBe(
      'POINTS_OUT_OF_ORDER',
    );
    expect(codeOf(() => survive([point(1, '1', '1'), point(1, '1', '1')]))).toBe(
      'POINTS_OUT_OF_ORDER',
    );
    expect(
      codeOf(() =>
        survive([
          { candleOpenTime: START - HOUR, equity: '1', equityAtLow: '1' },
          { candleOpenTime: START - 2 * HOUR, equity: '1', equityAtLow: '1' },
        ]),
      ),
    ).toBe('POINTS_OUT_OF_ORDER');
  });

  test('configuração já "parseada" mas fora do intervalo também é recusada', () => {
    expect(codeOf(() => survive([], { settings: { floorRate: '1', doubleRate: '2' } }))).toBe(
      'INVALID_SETTINGS',
    );
    expect(codeOf(() => survive([], { settings: { floorRate: '0.8', doubleRate: '1' } }))).toBe(
      'INVALID_SETTINGS',
    );
  });
});

describe('pureza e determinismo', () => {
  const points = [point(0, '9500', '9000'), point(1, '8100', '7900'), point(2, '21000', '20000')];

  test('não muta a entrada (congelada) e dá o mesmo resultado a cada chamada', () => {
    const frozen = Object.freeze(points.map((item) => Object.freeze({ ...item })));
    const settings = Object.freeze({ ...DEFAULTS });
    const first = api.computeBalanceSurvival({
      initialBalance: INITIAL,
      startTime: START,
      durationMilliseconds: HOUR,
      settings,
      points: frozen,
    });
    const second = api.computeBalanceSurvival({
      initialBalance: INITIAL,
      startTime: START,
      durationMilliseconds: HOUR,
      settings,
      points: frozen,
    });
    expect(second).toStrictEqual(first);
  });

  test('a saída é só texto, número e nulo (serializa sem perda) e carrega a versão da fórmula', () => {
    const result = survive(points);
    expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
    expect(result.version).toBe('survival-1');
  });
});

describe('diferencial contra o oráculo bigint independente', () => {
  const RANDOM_CASES = 600;

  test(`${RANDOM_CASES} séries aleatórias: níveis, marcos, tempos, extremos e progresso iguais`, () => {
    const random = createSeededRandom(20_261_010);
    const between = (low: number, high: number): number =>
      low + Math.floor(random() * (high - low + 1));
    for (let index = 0; index < RANDOM_CASES; index += 1) {
      const initial = BigInt(between(1, 5_000_000)) * 1_000n + BigInt(between(0, 999));
      const floorRate = BigInt(between(1, 9_999));
      const doubleRate = BigInt(between(10_001, 400_000));
      const duration = HOUR * between(1, 4);
      const count = between(0, 60);
      let level = initial;
      const oraclePoints: OraclePoint[] = [];
      for (let step = 0; step < count; step += 1) {
        level = level + (BigInt(between(-1_500, 1_500)) * initial) / 10_000n;
        if (level < 1n) level = 1n;
        const low = level - (BigInt(between(0, 400)) * initial) / 10_000n;
        oraclePoints.push({
          candleOpenTime: START - 2 * duration + step * duration,
          equity: level,
          equityAtLow: low < 1n ? 1n : low,
        });
      }
      const settings = {
        floorRate: formatProgress(floorRate),
        doubleRate: formatProgress(doubleRate),
      };
      const expected = runOracle({
        initial,
        floorRate,
        doubleRate,
        startTime: START,
        durationMilliseconds: duration,
        points: oraclePoints,
      });
      const actual = api.computeBalanceSurvival({
        initialBalance: formatScaled(initial),
        startTime: START,
        durationMilliseconds: duration,
        settings,
        points: oraclePoints.map((item) => ({
          candleOpenTime: item.candleOpenTime,
          equity: formatScaled(item.equity),
          equityAtLow: formatScaled(item.equityAtLow),
        })),
      });
      const label = `caso ${index}`;
      expect([label, actual.floor.level]).toStrictEqual([
        label,
        formatScaled(expected.floor.level),
      ]);
      expect([label, actual.double.level]).toStrictEqual([
        label,
        formatScaled(expected.double.level),
      ]);
      expect([label, actual.floor.reachedAtCandleTime]).toStrictEqual([
        label,
        expected.floor.reachedAt,
      ]);
      expect([label, actual.double.reachedAtCandleTime]).toStrictEqual([
        label,
        expected.double.reachedAt,
      ]);
      expect([label, actual.floor.elapsedMilliseconds]).toStrictEqual([
        label,
        expected.floor.elapsed,
      ]);
      expect([label, actual.double.elapsedMilliseconds]).toStrictEqual([
        label,
        expected.double.elapsed,
      ]);
      expect([label, actual.floor.progress]).toStrictEqual([
        label,
        formatProgress(expected.floor.progress),
      ]);
      expect([label, actual.double.progress]).toStrictEqual([
        label,
        formatProgress(expected.double.progress),
      ]);
      expect([label, actual.lowestEquity]).toStrictEqual([
        label,
        expected.lowest === null ? null : formatScaled(expected.lowest),
      ]);
      expect([label, actual.highestEquity]).toStrictEqual([
        label,
        expected.highest === null ? null : formatScaled(expected.highest),
      ]);
      expect([label, actual.floor.isReached]).toStrictEqual([label, actual.floor.progress === '1']);
      expect([label, actual.double.isReached]).toStrictEqual([
        label,
        actual.double.progress === '1',
      ]);
    }
    expect(parseScaled('1.5')).toBe(150_000_000n);
  });
});
