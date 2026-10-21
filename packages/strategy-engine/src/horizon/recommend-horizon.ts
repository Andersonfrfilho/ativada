// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, toEngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { HORIZON_RATE_DECIMAL_PLACES, HORIZON_RECOMMENDATION_RULES } from './horizon.constant.js';
import type { HorizonSummary } from './horizon.types.js';

const ZERO = new EngineDecimal(0);
const PERCENT = 100;

type EligibleRow = {
  readonly horizonDays: number;
  readonly medianPerDay: EngineDecimalValue;
};

// Regra do spec 003 §5. Mediana e pior 10% valem pelo texto publicado (o que a pessoa vê na tela); a fração de
// positivas, pelas contagens exatas (a fração publicada já vem arredondada para baixo).
function isEligible(row: HorizonSummary): boolean {
  if (row.isShortHistory || row.median === null || row.worstDecile === null) return false;
  const rules = HORIZON_RECOMMENDATION_RULES;
  if (!toEngineDecimal(row.median).greaterThan(ZERO)) return false;
  if (row.positiveCount * PERCENT < rules.minimumPositivePercent * row.windowCount) return false;
  return toEngineDecimal(row.worstDecile).greaterThanOrEqualTo(rules.minimumWorstDecile);
}

function toEligibleRow(row: HorizonSummary): EligibleRow {
  const median = toEngineDecimal(row.median ?? '0');
  return {
    horizonDays: row.horizonDays,
    medianPerDay: median
      .dividedBy(row.horizonDays)
      .toDecimalPlaces(HORIZON_RATE_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR),
  };
}

// O prazo recomendado (em dias) ou `undefined` quando nenhuma linha passa: maior mediana por dia, e no empate o
// prazo mais longo (menos operações, menos taxa).
export function recommendHorizon(rows: readonly HorizonSummary[]): number | undefined {
  const ranked = rows
    .filter(isEligible)
    .map(toEligibleRow)
    .sort(
      (left, right) =>
        right.medianPerDay.comparedTo(left.medianPerDay) || right.horizonDays - left.horizonDays,
    );
  return ranked[0]?.horizonDays;
}
