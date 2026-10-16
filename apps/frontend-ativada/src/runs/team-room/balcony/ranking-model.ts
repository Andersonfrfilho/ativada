// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatDecimalText, parseScaled } from '../../../format/decimal.js';
import {
  formatIntervalLimitPercent,
  formatRatePercent,
} from '../../candle-chart/projection-text.js';
import type { ProjectionSummary } from '../../candle-chart/projections.validation.js';

export type RankingRow = {
  readonly key: string;
  readonly name: string;
  // "1.420 de 2.552" e a taxa contra os 50% da moeda ao ar; sem medida, "—".
  readonly hitsText: string;
  readonly rateText: string;
  // "53,7% a 57,6%": o pior e o melhor caso do intervalo de Wilson.
  readonly intervalText: string;
  readonly verdict: ProjectionSummary['verdict'] | undefined;
  readonly weightText: string;
  readonly lowerBound: bigint | undefined;
};

const NO_VALUE = '—';

function groupedCount(value: number): string {
  return formatDecimalText(String(value), { minimumFraction: 0, maximumFraction: 0 });
}

// A linha do que o servidor mede hoje: o acerto do lado da previsão da simulação (placar das regras), com o intervalo de Wilson.
export function buildMeasuredRow(summary: ProjectionSummary): RankingRow {
  const hasInterval = summary.wilson !== null && summary.verdict !== 'too_few';
  const lower = summary.wilson === null ? undefined : parseScaled(summary.wilson.lower);
  return {
    key: 'scoreboard',
    name: 'Placar da estratégia',
    hitsText: `${groupedCount(summary.hits)} de ${groupedCount(summary.counted)}`,
    rateText: summary.verdict === 'too_few' ? NO_VALUE : formatRatePercent(summary.hitRate),
    intervalText:
      hasInterval && summary.wilson !== null
        ? `${formatIntervalLimitPercent(summary.wilson.lower, 'lower')} a ${formatIntervalLimitPercent(summary.wilson.upper, 'upper')}`
        : NO_VALUE,
    verdict: summary.verdict,
    weightText: NO_VALUE,
    lowerBound: hasInterval ? lower : undefined,
  };
}

// Quem ainda não tem medida própria (o servidor só mede o resumo geral): sem número, com o peso que a estratégia deu.
export function buildUnmeasuredRow(name: string, weightText: string): RankingRow {
  return {
    key: name,
    name,
    hitsText: NO_VALUE,
    rateText: NO_VALUE,
    intervalText: NO_VALUE,
    verdict: undefined,
    weightText,
    lowerBound: undefined,
  };
}

function compareLower(first: bigint | undefined, second: bigint | undefined): number {
  if (first === undefined || second === undefined || first === second) return 0;
  return first > second ? 1 : -1;
}

// Ordem pelo limite inferior de Wilson (o pior caso), nunca pelo acerto bruto; sem medida ou com poucas previsões fica depois.
export function rankRows(rows: readonly RankingRow[]): {
  readonly ranked: readonly RankingRow[];
  readonly unranked: readonly RankingRow[];
} {
  const ranked = rows
    .filter((row) => row.lowerBound !== undefined)
    .sort((left, right) => compareLower(right.lowerBound, left.lowerBound));
  return { ranked, unranked: rows.filter((row) => row.lowerBound === undefined) };
}

// A coroa só vai para quem está acima da moeda ao ar, mesmo no pior caso.
export function hasCrown(row: RankingRow): boolean {
  return row.verdict === 'above';
}
