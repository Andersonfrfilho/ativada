// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ChartRange } from './chart-range.js';

const MINUTE_MILLISECONDS = 60_000;
const HOUR_MILLISECONDS = 60 * MINUTE_MILLISECONDS;

const TIMEFRAME_MILLISECONDS: Readonly<Record<string, number>> = {
  '3m': 3 * MINUTE_MILLISECONDS,
  '15m': 15 * MINUTE_MILLISECONDS,
  '1h': HOUR_MILLISECONDS,
  '4h': 4 * HOUR_MILLISECONDS,
  '1d': 24 * HOUR_MILLISECONDS,
};

// A duração de uma vela em milissegundos; vela que o painel não conhece não tem duração (nada é inventado).
export function timeframeMilliseconds(timeframe: string): number | undefined {
  return TIMEFRAME_MILLISECONDS[timeframe];
}

export type LastClosedParams = {
  readonly timeframe: string;
  readonly lastClosedCandleTime: number | null;
};

// O servidor manda a ABERTURA da última vela processada; ela só estava fechada quando a vela seguinte começou.
// Timeframe que o painel não conhece: sem rótulo, em vez de uma hora inventada.
export function lastClosedAt(params: LastClosedParams): number | undefined {
  const duration = TIMEFRAME_MILLISECONDS[params.timeframe];
  if (duration === undefined || params.lastClosedCandleTime === null) return undefined;
  return params.lastClosedCandleTime + duration;
}

// Faixa fixa que termina antes da última vela fechada: há coisa nova fora dela (spec 005, plan D8).
export function hasNewerCandles(
  range: ChartRange | undefined,
  lastClosedCandleTime: number | null | undefined,
): boolean {
  return range !== undefined && lastClosedCandleTime != null && lastClosedCandleTime >= range.to;
}
