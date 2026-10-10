// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MAX_WALK_FORWARD_COMBINATIONS } from '../engine.constant.js';
import { createStrategyVersion } from '../parse-strategy-config.js';
import type { StrategyConfig } from '../strategy-config.types.js';
import { deriveStrategyConfig, readTunableValue } from './derive-strategy-config.js';
import { MAX_RAW_GRID_COMBINATIONS, WALK_FORWARD_ERROR_CODE } from './walk-forward.constant.js';
import { WalkForwardError } from './walk-forward.error.js';
import { parseWalkForwardGrid } from './walk-forward-grid.schema.js';
import type { GridAssignment, GridCombination, WalkForwardGrid } from './walk-forward.types.js';

export type GridParams = {
  readonly base: StrategyConfig;
  readonly grid: unknown;
};

export type GridCount = {
  readonly rawCombinations: number;
  readonly validCombinations: number;
  readonly discardedCombinations: number;
};

export type ExpandedGrid = {
  readonly combinations: readonly GridCombination[];
  readonly rawCombinations: number;
  readonly discardedCombinations: number;
};

function refuseGrid(message: string): never {
  throw new WalkForwardError({ code: WALK_FORWARD_ERROR_CODE.INVALID_GRID, message });
}

// Cada caminho tem que existir na configuração-base e o valor ser do mesmo tipo que o atual.
function assertGridFitsBase(base: StrategyConfig, grid: WalkForwardGrid): void {
  for (const parameter of grid.parameters) {
    const current = readTunableValue(base, parameter.path);
    if (current === undefined) {
      refuseGrid(`O caminho "${parameter.path}" não existe nesta configuração.`);
    }
    if (parameter.values.some((value) => typeof value !== typeof current)) {
      refuseGrid(`Os valores de "${parameter.path}" têm o tipo errado.`);
    }
  }
}

function computeRawCount(grid: WalkForwardGrid): number {
  return grid.parameters.reduce((product, item) => product * item.values.length, 1);
}

// Odômetro: o último parâmetro varia mais depressa. É a ORDEM DA GRADE, usada no último desempate.
function* enumerateAssignments(grid: WalkForwardGrid): Generator<GridAssignment[]> {
  const counters = grid.parameters.map(() => 0);
  const total = computeRawCount(grid);
  for (let produced = 0; produced < total; produced += 1) {
    yield grid.parameters.map((parameter, position) => ({
      path: parameter.path,
      value: parameter.values[counters[position] ?? 0] ?? 0,
    }));
    for (let position = counters.length - 1; position >= 0; position -= 1) {
      const next = (counters[position] ?? 0) + 1;
      const size = grid.parameters[position]?.values.length ?? 1;
      counters[position] = next % size;
      if (next < size) break;
    }
  }
}

function prepareGrid(params: GridParams): WalkForwardGrid {
  const grid = parseWalkForwardGrid(params.grid);
  assertGridFitsBase(params.base, grid);
  const rawCombinations = computeRawCount(grid);
  if (rawCombinations > MAX_RAW_GRID_COMBINATIONS) {
    throw new WalkForwardError({
      code: WALK_FORWARD_ERROR_CODE.GRID_TOO_LARGE,
      message: `A grade tem ${rawCombinations} combinações brutas; o teto é ${MAX_RAW_GRID_COMBINATIONS}.`,
      details: { rawCombinations, limit: MAX_RAW_GRID_COMBINATIONS },
    });
  }
  return grid;
}

type ValidCombination = {
  readonly assignment: readonly GridAssignment[];
  readonly config: StrategyConfig;
};

function collectValid(base: StrategyConfig, grid: WalkForwardGrid): readonly ValidCombination[] {
  const valid: ValidCombination[] = [];
  for (const assignment of enumerateAssignments(grid)) {
    const derived = deriveStrategyConfig(base, assignment);
    if (derived.isValid) valid.push({ assignment, config: derived.config });
  }
  return valid;
}

// O teto de 200 conta só as combinações VÁLIDAS (RNF02): as que o esquema recusa são descartadas e contadas à parte.
export function countValidCombinations(params: GridParams): GridCount {
  const grid = prepareGrid(params);
  const rawCombinations = computeRawCount(grid);
  const validCombinations = collectValid(params.base, grid).length;
  return {
    rawCombinations,
    validCombinations,
    discardedCombinations: rawCombinations - validCombinations,
  };
}

// Expande a grade em estratégias prontas (config + hash). Acima do teto, ou sem nenhuma válida, falha ANTES de
// qualquer execução, e o erro leva a contagem.
export function expandWalkForwardGrid(params: GridParams): ExpandedGrid {
  const grid = prepareGrid(params);
  const rawCombinations = computeRawCount(grid);
  const valid = collectValid(params.base, grid);
  if (valid.length > MAX_WALK_FORWARD_COMBINATIONS) {
    throw new WalkForwardError({
      code: WALK_FORWARD_ERROR_CODE.GRID_TOO_LARGE,
      message: `A grade tem ${valid.length} combinações válidas; o teto é ${MAX_WALK_FORWARD_COMBINATIONS}.`,
      details: {
        validCombinations: valid.length,
        rawCombinations,
        limit: MAX_WALK_FORWARD_COMBINATIONS,
      },
    });
  }
  if (valid.length === 0) {
    throw new WalkForwardError({
      code: WALK_FORWARD_ERROR_CODE.NO_VALID_COMBINATIONS,
      message: 'Nenhuma combinação da grade passa o esquema da estratégia.',
      details: { rawCombinations },
    });
  }
  return {
    combinations: valid.map((combination, index) => ({
      index,
      assignment: combination.assignment,
      strategy: createStrategyVersion(combination.config),
    })),
    rawCombinations,
    discardedCombinations: rawCombinations - valid.length,
  };
}
