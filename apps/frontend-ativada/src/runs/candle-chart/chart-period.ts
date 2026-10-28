// Copyright (c) 2026 Ada Technology. All rights reserved.
import { timeframeMilliseconds } from '../live-chart.js';

const DAY = 86_400_000;

export const CHART_PERIOD = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  YEAR: 'year',
  ALL: 'all',
} as const;
export type ChartPeriod = (typeof CHART_PERIOD)[keyof typeof CHART_PERIOD];

type PeriodPlan = {
  readonly label: string;
  readonly name: string;
  // A vela que cabe no período sem passar de poucas centenas na tela; `undefined` em "Tudo".
  readonly timeframe: string;
  readonly spanMilliseconds: number | undefined;
};

export const PERIOD_PLANS: Readonly<Record<ChartPeriod, PeriodPlan>> = {
  [CHART_PERIOD.DAY]: { label: '1D', name: 'Último dia', timeframe: '15m', spanMilliseconds: DAY },
  [CHART_PERIOD.WEEK]: {
    label: '1S',
    name: 'Última semana',
    timeframe: '1h',
    spanMilliseconds: 7 * DAY,
  },
  [CHART_PERIOD.MONTH]: {
    label: '1M',
    name: 'Último mês',
    timeframe: '4h',
    spanMilliseconds: 30 * DAY,
  },
  [CHART_PERIOD.YEAR]: {
    label: '1A',
    name: 'Último ano',
    timeframe: '1d',
    spanMilliseconds: 365 * DAY,
  },
  [CHART_PERIOD.ALL]: {
    label: 'Tudo',
    name: 'Todo o histórico',
    timeframe: '1d',
    spanMilliseconds: undefined,
  },
};

export const CHART_PERIODS: readonly ChartPeriod[] = Object.values(CHART_PERIOD);

// A vela do plano se o ambiente a oferece; senão a oferecida mais próxima dela em duração.
export function pickPeriodTimeframe<TOption extends string>(
  period: ChartPeriod,
  options: readonly TOption[],
): TOption | undefined {
  const wanted = timeframeMilliseconds(PERIOD_PLANS[period].timeframe) ?? 0;
  let best: TOption | undefined;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const option of options) {
    const gap = Math.abs((timeframeMilliseconds(option) ?? Number.POSITIVE_INFINITY) - wanted);
    if (gap < bestGap) {
      best = option;
      bestGap = gap;
    }
  }
  return best;
}

// Quantas velas cobrem o período (`undefined` = mostrar tudo o que foi carregado).
export function barsForPeriod(
  period: ChartPeriod,
  durationMilliseconds: number,
): number | undefined {
  const span = PERIOD_PLANS[period].spanMilliseconds;
  if (span === undefined || durationMilliseconds <= 0) return undefined;
  return Math.ceil(span / durationMilliseconds);
}
