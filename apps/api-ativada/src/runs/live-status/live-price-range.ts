// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { PriceRangeRow, RunPriceRange } from '@ativada/database';
import { toEngineDecimal } from '@ativada/strategy-engine';

import { formatPrice } from './live-number-format.js';

export type PriceRangeRowView = {
  readonly low: string;
  readonly high: string;
  readonly from: number;
};

// Mínima e máxima do preço da moeda: no período da meta desta simulação e desde a primeira da sequência renovada.
export type PriceRangeSectionView = {
  readonly period: PriceRangeRowView;
  readonly total: PriceRangeRowView;
  readonly periods: number;
  readonly message: string;
};

function toRowView(row: PriceRangeRow): PriceRangeRowView | undefined {
  if (row.low === null || row.high === null) return undefined;
  return {
    low: toEngineDecimal(row.low).toString(),
    high: toEngineDecimal(row.high).toString(),
    from: row.from,
  };
}

function describeRange(
  period: PriceRangeRowView,
  total: PriceRangeRowView,
  periods: number,
): string {
  const periodText = `Neste período a moeda foi de ${formatPrice(period.low)} a ${formatPrice(period.high)}.`;
  if (periods <= 1) return periodText;
  return `${periodText} Nos ${periods} períodos, de ${formatPrice(total.low)} a ${formatPrice(total.high)}.`;
}

// Sem vela fechada no período ainda (simulação que acabou de começar ou renovar), a seção é `null`.
export function buildPriceRangeSection(
  range: RunPriceRange | undefined,
): PriceRangeSectionView | null {
  if (range === undefined) return null;
  const period = toRowView(range.period);
  const total = toRowView(range.total);
  if (period === undefined || total === undefined) return null;
  return {
    period,
    total,
    periods: range.periods,
    message: describeRange(period, total, range.periods),
  };
}
