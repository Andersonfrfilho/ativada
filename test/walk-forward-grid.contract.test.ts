// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  buildClassicStrategy,
  createRandom,
  EMA_FAST_PATH,
  EMA_SLOW_PATH,
  integerRange,
  pickInteger,
  loadWalkForwardEngineApi,
} from './fixtures/walk-forward/walk-forward-api.fixture.js';

const {
  countValidCombinations,
  createStrategyVersion,
  deriveStrategyConfig,
  expandWalkForwardGrid,
  MAX_WALK_FORWARD_COMBINATIONS,
  parseWalkForwardGrid,
  WALK_FORWARD_ERROR_CODE,
  WalkForwardError,
} = await loadWalkForwardEngineApi();

const base = buildClassicStrategy().config;
const PROPERTY_CASES = 1_200;
const PROPERTY_TIMEOUT_MILLISECONDS = 60_000;
const THRESHOLD_VALUES = ['1', '1.25', '1.5', '1.75', '2', '2.25', '2.5', '2.75', '3', '3.25'];

type WalkForwardErrorInstance = InstanceType<typeof WalkForwardError>;

function errorOf(run: () => unknown): WalkForwardErrorInstance | undefined {
  try {
    run();
  } catch (error: unknown) {
    if (error instanceof WalkForwardError) return error;
    throw error;
  }
  return undefined;
}

function emaGrid(fast: readonly number[], slow: readonly number[]): unknown {
  return {
    parameters: [
      { path: EMA_FAST_PATH, values: fast },
      { path: EMA_SLOW_PATH, values: slow },
    ],
  };
}

describe('catálogo FECHADO de caminhos ajustáveis', () => {
  test.each([
    'schemaVersion',
    'rules',
    '__proto__.polluted',
    'constructor.prototype.x',
    'risk.unknown',
    'risk',
    'thresholds.buy.extra',
    `rules.${'ema-9-21'}.id`,
    `rules.${'ema-9-21'}.kind`,
    'rules..period',
    'rules.ema-9-21',
    'regime.weights',
    'entry.orderType',
    '',
  ])('%p não é caminho ajustável', (path) => {
    expect(errorOf(() => parseWalkForwardGrid({ parameters: [{ path, values: [3] }] }))?.code).toBe(
      WALK_FORWARD_ERROR_CODE.INVALID_GRID,
    );
  });

  test('os caminhos do catálogo são aceitos pela sintaxe', () => {
    const paths = [
      'thresholds.buy',
      'thresholds.sell',
      'risk.atrPeriod',
      'risk.stopAtrMultiple',
      'risk.targetAtrMultiple',
      'risk.riskPerTrade',
      'risk.maxExposureRate',
      'regime.period',
      'regime.trendThreshold',
      'entry.offsetRate',
      'entry.expiryCandles',
      EMA_FAST_PATH,
      'rules.macd-12-26-9.signalPeriod',
      'rules.rsi-14.oversold',
    ];
    for (const path of paths) {
      expect(() => parseWalkForwardGrid({ parameters: [{ path, values: [3] }] })).not.toThrow();
    }
  });

  test('campo extra, valores vazios, repetidos, caminho repetido e tipo de valor errado', () => {
    const invalid = [
      { parameters: [], extra: 1 },
      { parameters: [] },
      { parameters: [{ path: 'risk.atrPeriod', values: [] }] },
      { parameters: [{ path: 'risk.atrPeriod', values: [14, 14] }] },
      { parameters: [{ path: 'risk.atrPeriod', values: [14.5] }] },
      { parameters: [{ path: 'risk.atrPeriod', values: [true] }] },
      { parameters: [{ path: 'risk.stopAtrMultiple', values: ['1e3'] }] },
      {
        parameters: [
          { path: 'risk.atrPeriod', values: [14] },
          { path: 'risk.atrPeriod', values: [15] },
        ],
      },
      { parameters: [{ path: 'risk.atrPeriod', values: [14], note: 'x' }] },
    ];
    for (const grid of invalid) {
      expect(errorOf(() => parseWalkForwardGrid(grid))?.code).toBe(
        WALK_FORWARD_ERROR_CODE.INVALID_GRID,
      );
    }
  });

  test('o caminho tem que existir na configuração-base e ser do mesmo tipo', () => {
    const cases: readonly unknown[] = [
      { parameters: [{ path: 'rules.ghost.period', values: [10] }] },
      { parameters: [{ path: 'rules.ema-9-21.period', values: [10] }] },
      { parameters: [{ path: 'entry.offsetRate', values: ['0.01'] }] },
      { parameters: [{ path: 'risk.atrPeriod', values: ['14'] }] },
      { parameters: [{ path: 'risk.stopAtrMultiple', values: [2] }] },
    ];
    for (const grid of cases) {
      expect(errorOf(() => expandWalkForwardGrid({ base, grid }))?.code).toBe(
        WALK_FORWARD_ERROR_CODE.INVALID_GRID,
      );
    }
  });

  test('regime.* só existe quando o regime é ADX', () => {
    const withoutRegime = createStrategyVersion({
      ...buildClassicStrategy().config,
      regime: { kind: 'none' },
    });
    const grid = { parameters: [{ path: 'regime.period', values: [10] }] };
    expect(errorOf(() => expandWalkForwardGrid({ base: withoutRegime.config, grid }))?.code).toBe(
      WALK_FORWARD_ERROR_CODE.INVALID_GRID,
    );
    expect(() => expandWalkForwardGrid({ base, grid })).not.toThrow();
  });
});

describe('deriveStrategyConfig', () => {
  test('aplica a atribuição e devolve configuração que passa o esquema', () => {
    const derived = deriveStrategyConfig(base, [
      { path: EMA_FAST_PATH, value: 5 },
      { path: 'thresholds.buy', value: '1.5' },
    ]);
    expect(derived.isValid).toBe(true);
    if (!derived.isValid) return;
    const rule = derived.config.rules.find((candidate) => candidate.id === 'ema-9-21');
    expect(rule).toMatchObject({ kind: 'ema_cross', fastPeriod: 5, slowPeriod: 21 });
    expect(derived.config.thresholds).toEqual({ buy: '1.5', sell: '-2' });
    expect(createStrategyVersion(derived.config).config).toEqual(derived.config);
  });

  test('não muta a base e é pura', () => {
    const before = JSON.stringify(base);
    const assignment = [{ path: 'risk.atrPeriod', value: 20 }] as const;
    const first = deriveStrategyConfig(base, assignment);
    expect(JSON.stringify(base)).toBe(before);
    expect(deriveStrategyConfig(base, assignment)).toEqual(first);
  });

  test('combinação que quebra o esquema é inválida e diz por quê', () => {
    const derived = deriveStrategyConfig(base, [
      { path: EMA_FAST_PATH, value: 30 },
      { path: EMA_SLOW_PATH, value: 21 },
    ]);
    expect(derived.isValid).toBe(false);
    if (derived.isValid) return;
    expect(derived.issues.length).toBeGreaterThan(0);
  });

  test('valor decimal fora do intervalo é inválido (limiar de compra não positivo)', () => {
    expect(deriveStrategyConfig(base, [{ path: 'thresholds.buy', value: '-1' }]).isValid).toBe(
      false,
    );
  });
});

describe('teto de 200 combinações: só as VÁLIDAS contam', () => {
  test('grade de 400 combinações brutas com 190 válidas passa', () => {
    const grid = emaGrid(integerRange(2, 21), integerRange(2, 21));
    expect(countValidCombinations({ base, grid })).toEqual({
      rawCombinations: 400,
      validCombinations: 190,
      discardedCombinations: 210,
    });
    const expanded = expandWalkForwardGrid({ base, grid });
    expect(expanded.combinations).toHaveLength(190);
    expect(expanded.discardedCombinations).toBe(210);
    expect(expanded.rawCombinations).toBe(400);
  });

  test('201 ou mais válidas recusam ANTES de rodar, com a contagem', () => {
    expect(MAX_WALK_FORWARD_COMBINATIONS).toBe(200);
    const grid = emaGrid(integerRange(2, 22), integerRange(2, 22));
    const error = errorOf(() => expandWalkForwardGrid({ base, grid }));
    expect(error?.code).toBe(WALK_FORWARD_ERROR_CODE.GRID_TOO_LARGE);
    expect(error?.details).toMatchObject({
      validCombinations: 210,
      rawCombinations: 441,
      limit: 200,
    });
  });

  test('exatamente 200 válidas (5 × 4 pares × 10 limiares) passa', () => {
    const grid = {
      parameters: [
        { path: EMA_FAST_PATH, values: [2, 3, 4, 5, 6] },
        { path: EMA_SLOW_PATH, values: [10, 11, 12, 13] },
        { path: 'thresholds.buy', values: THRESHOLD_VALUES },
      ],
    };
    expect(countValidCombinations({ base, grid }).validCombinations).toBe(200);
    expect(expandWalkForwardGrid({ base, grid }).combinations).toHaveLength(200);
  });

  test('produto bruto absurdo recusa sem enumerar', () => {
    const grid = {
      parameters: [
        { path: 'risk.atrPeriod', values: integerRange(2, 40) },
        { path: 'regime.period', values: integerRange(2, 40) },
        { path: 'regime.trendThreshold', values: integerRange(1, 40) },
        { path: EMA_FAST_PATH, values: integerRange(2, 40) },
      ],
    };
    const error = errorOf(() => expandWalkForwardGrid({ base, grid }));
    expect(error?.code).toBe(WALK_FORWARD_ERROR_CODE.GRID_TOO_LARGE);
    expect(error?.details).toMatchObject({ rawCombinations: 39 * 39 * 40 * 39 });
  });

  test('grade sem nenhuma combinação válida falha com código próprio', () => {
    const grid = emaGrid([30, 40], [5, 6]);
    expect(errorOf(() => expandWalkForwardGrid({ base, grid }))?.code).toBe(
      WALK_FORWARD_ERROR_CODE.NO_VALID_COMBINATIONS,
    );
  });
});

describe('expansão', () => {
  test('ordem determinística da grade (o último parâmetro varia mais depressa) e hashes', () => {
    const grid = emaGrid([5, 6], [10, 11, 12]);
    const { combinations } = expandWalkForwardGrid({ base, grid });
    expect(
      combinations.map((combination) => combination.assignment.map((item) => item.value)),
    ).toEqual([
      [5, 10],
      [5, 11],
      [5, 12],
      [6, 10],
      [6, 11],
      [6, 12],
    ]);
    expect(combinations.map((combination) => combination.index)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const combination of combinations) {
      expect(combination.strategy.configHash).toBe(
        createStrategyVersion(combination.strategy.config).configHash,
      );
    }
    expect(new Set(combinations.map((combination) => combination.strategy.configHash)).size).toBe(
      6,
    );
  });

  test(
    `${PROPERTY_CASES} grades aleatórias: teto respeitado, contagem fecha, determinismo`,
    () => {
      const random = createRandom(20_261_014);
      const paths = [EMA_FAST_PATH, EMA_SLOW_PATH, 'risk.atrPeriod', 'regime.period'] as const;
      let accepted = 0;
      for (let index = 0; index < PROPERTY_CASES; index += 1) {
        const parameters = paths.slice(0, pickInteger(random, 1, 4)).map((path) => {
          const first = pickInteger(random, 2, 40);
          return { path, values: integerRange(first, first + pickInteger(random, 0, 6)) };
        });
        const grid = { parameters };
        const counted = countValidCombinations({ base, grid });
        expect(counted.validCombinations + counted.discardedCombinations).toBe(
          counted.rawCombinations,
        );
        const error = errorOf(() => expandWalkForwardGrid({ base, grid }));
        if (counted.validCombinations > 200) {
          expect(error?.code).toBe(WALK_FORWARD_ERROR_CODE.GRID_TOO_LARGE);
          continue;
        }
        if (counted.validCombinations === 0) {
          expect(error?.code).toBe(WALK_FORWARD_ERROR_CODE.NO_VALID_COMBINATIONS);
          continue;
        }
        accepted += 1;
        const expanded = expandWalkForwardGrid({ base, grid });
        expect(expanded.combinations.length).toBe(counted.validCombinations);
        expect(expanded.combinations.length).toBeLessThanOrEqual(200);
        expect(expandWalkForwardGrid({ base, grid })).toEqual(expanded);
      }
      expect(accepted).toBeGreaterThan(PROPERTY_CASES / 3);
    },
    PROPERTY_TIMEOUT_MILLISECONDS,
  );
});
