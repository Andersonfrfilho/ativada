// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { PRODUCTION_RISK_API } from './fixtures/strategy-engine/risk/risk-api.fixture.js';
import {
  buildRiskGrid,
  createRandom,
  RISK_GRID_SIZE,
} from './fixtures/strategy-engine/risk/risk-grid.fixture.js';
import {
  findFirstMismatch,
  findFirstPropertyViolation,
  measureRiskApi,
} from './fixtures/strategy-engine/risk/risk-judge.fixture.js';

const MINIMUM_GRID_SIZE = 5_000;
const MINIMUM_PER_CONSTRAINT = 100;
const CONSTRAINTS = [
  'none',
  'exposure_capped',
  'cash_capped',
  'volume_capped',
  'below_min_notional',
  'invalid_stop',
  'zero_risk',
] as const;

const GRID = buildRiskGrid();

describe('risk: production against the independent reference on a large deterministic grid', () => {
  test('the grid is big and reproducible', () => {
    expect(RISK_GRID_SIZE).toBeGreaterThanOrEqual(MINIMUM_GRID_SIZE);
    expect(GRID).toHaveLength(RISK_GRID_SIZE);
    expect(buildRiskGrid(50)).toStrictEqual(GRID.slice(0, 50));
    const first = createRandom(7);
    const second = createRandom(7);
    expect(Array.from({ length: 5 }, () => first(1_000))).toStrictEqual(
      Array.from({ length: 5 }, () => second(1_000)),
    );
  });

  test('every outcome the sizing can produce is exercised many times', () => {
    const measure = measureRiskApi(PRODUCTION_RISK_API, GRID);
    for (const constraint of CONSTRAINTS) {
      expect(measure.byConstraint[constraint] ?? 0).toBeGreaterThanOrEqual(MINIMUM_PER_CONSTRAINT);
    }
  });

  test('quantity, notional, constraint, stop and target are identical, byte for byte', () => {
    const measure = measureRiskApi(PRODUCTION_RISK_API, GRID);
    expect(measure.mismatches).toBe(0);
    expect(measure.maxQuantityDeviation).toBe('0');
    expect(findFirstMismatch(PRODUCTION_RISK_API, GRID)).toBeUndefined();
  });

  test('the properties hold on every case: loss ≤ risk, debit ≤ cash, step, minimum, caps', () => {
    expect(findFirstPropertyViolation(PRODUCTION_RISK_API, GRID)).toBeUndefined();
  });
});
