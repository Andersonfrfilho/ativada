// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal } from '../../../../packages/strategy-engine/src/index.js';
import type { RiskApi } from './risk-api.fixture.js';
import type { RiskCase } from './risk-grid.fixture.js';
import { referencePositionSize, referenceProtectivePrices } from './reference-risk.fixture.js';
import { findProtectiveViolation, findSizeViolation } from './risk-properties.fixture.js';

export type RiskRewrite = (riskCase: RiskCase) => RiskCase;

export type RiskVerdict = {
  readonly differential: string | undefined;
  readonly property: string | undefined;
};

export type RiskMeasure = {
  readonly cases: number;
  readonly mismatches: number;
  readonly maxQuantityDeviation: string;
  readonly byConstraint: Readonly<Record<string, number>>;
};

const expectations = new Map<
  RiskCase,
  {
    sizing: ReturnType<typeof referencePositionSize>;
    protective: ReturnType<typeof referenceProtectivePrices>;
  }
>();

function expectedOf(riskCase: RiskCase): NonNullable<ReturnType<typeof expectations.get>> {
  const cached = expectations.get(riskCase);
  if (cached !== undefined) return cached;
  const created = {
    sizing: referencePositionSize(riskCase.sizing),
    protective: referenceProtectivePrices(riskCase.protective),
  };
  expectations.set(riskCase, created);
  return created;
}

// Resultado byte a byte: a serialização JSON inclui chaves, ordem e texto de cada decimal.
export function findFirstMismatch(
  api: RiskApi,
  cases: readonly RiskCase[],
  rewrite: RiskRewrite = (riskCase) => riskCase,
): string | undefined {
  for (const riskCase of cases) {
    const input = rewrite(riskCase);
    const expected = expectedOf(riskCase);
    const sizing = api.computePositionSize(input.sizing);
    if (JSON.stringify(sizing) !== JSON.stringify(expected.sizing)) {
      return `caso ${riskCase.index}: tamanho ${JSON.stringify(sizing)} ≠ ${JSON.stringify(expected.sizing)}`;
    }
    const protective = api.computeProtectivePrices(input.protective);
    if (JSON.stringify(protective) !== JSON.stringify(expected.protective)) {
      return `caso ${riskCase.index}: proteção ${JSON.stringify(protective)} ≠ ${JSON.stringify(expected.protective)}`;
    }
  }
  return undefined;
}

export function findFirstPropertyViolation(
  api: RiskApi,
  cases: readonly RiskCase[],
  rewrite: RiskRewrite = (riskCase) => riskCase,
): string | undefined {
  for (const riskCase of cases) {
    const input = rewrite(riskCase);
    const sizing = findSizeViolation(riskCase.sizing, api.computePositionSize(input.sizing));
    if (sizing !== undefined) return `caso ${riskCase.index}: ${sizing}`;
    const protective = findProtectiveViolation(
      riskCase.protective,
      api.computeProtectivePrices(input.protective),
    );
    if (protective !== undefined) return `caso ${riskCase.index}: ${protective}`;
  }
  return undefined;
}

export function judgeRiskApi(params: {
  readonly api: RiskApi;
  readonly cases: readonly RiskCase[];
  readonly rewrite?: RiskRewrite;
}): RiskVerdict {
  return {
    differential: findFirstMismatch(params.api, params.cases, params.rewrite),
    property: findFirstPropertyViolation(params.api, params.cases, params.rewrite),
  };
}

export function measureRiskApi(api: RiskApi, cases: readonly RiskCase[]): RiskMeasure {
  let mismatches = 0;
  let maxDeviation = new EngineDecimal(0);
  const byConstraint: Record<string, number> = {};
  for (const riskCase of cases) {
    const expected = expectedOf(riskCase);
    const actual = api.computePositionSize(riskCase.sizing);
    byConstraint[expected.sizing.constraint] = (byConstraint[expected.sizing.constraint] ?? 0) + 1;
    const protective = api.computeProtectivePrices(riskCase.protective);
    const isSame =
      JSON.stringify(actual) === JSON.stringify(expected.sizing) &&
      JSON.stringify(protective) === JSON.stringify(expected.protective);
    if (!isSame) mismatches += 1;
    const deviation = new EngineDecimal(actual.quantity).minus(expected.sizing.quantity).abs();
    if (deviation.greaterThan(maxDeviation)) maxDeviation = deviation;
  }
  return {
    cases: cases.length,
    mismatches,
    maxQuantityDeviation: maxDeviation.toFixed(),
    byConstraint,
  };
}
