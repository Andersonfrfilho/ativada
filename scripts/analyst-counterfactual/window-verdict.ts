// Copyright (c) 2026 Ada Technology. All rights reserved.
import { computeWilsonInterval } from '../../packages/statistics/src/index.js';
import { formatEngineDecimal, toEngineDecimal } from '../../packages/strategy-engine/src/index.js';
import type { EquityRecord, WindowResult } from './counterfactual.types.js';

export const WINDOW_MILLISECONDS = 7 * 86_400_000;
// D11: abaixo de 20 janelas com diferença o veredito é `too_few`.
export const MINIMUM_COUNTED_WINDOWS = 20;
const HALF = '0.5';

export const WINDOW_VERDICT = {
  HELPED: 'helped',
  HURT: 'hurt',
  EVEN: 'even',
  TOO_FEW: 'too_few',
} as const;
export type WindowVerdict = (typeof WINDOW_VERDICT)[keyof typeof WINDOW_VERDICT];

export type WindowJudgement = {
  readonly windows: number;
  readonly helped: number;
  readonly hurt: number;
  readonly ties: number;
  readonly counted: number;
  readonly lower: string | null;
  readonly upper: string | null;
  readonly verdict: WindowVerdict;
};

// O patrimônio no fechamento da última vela com abertura ANTES de `time` (o saldo inicial se não há nenhuma).
function equityBefore(
  points: readonly EquityRecord[],
  time: number,
  initialBalance: string,
): string {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((points[middle]?.candleTime ?? Number.POSITIVE_INFINITY) < time) low = middle + 1;
    else high = middle;
  }
  return points[low - 1]?.equity ?? initialBalance;
}

export type ComputeWindowsParams = {
  readonly baseline: readonly EquityRecord[];
  readonly analyst: readonly EquityRecord[];
  readonly initialBalance: string;
  readonly periodStart: number;
  // Abertura da última vela do período.
  readonly periodEnd: number;
  readonly candleMilliseconds: number;
};

// Janelas de 7 dias seguidas a partir do início do período; o resto menor que 7 dias no fim não entra.
export function computeWindows(params: ComputeWindowsParams): WindowResult[] {
  const { baseline, analyst, initialBalance, periodStart } = params;
  const span = params.periodEnd + params.candleMilliseconds - periodStart;
  const count = Math.floor(span / WINDOW_MILLISECONDS);
  const results: WindowResult[] = [];
  for (let index = 0; index < count; index += 1) {
    const startTime = periodStart + index * WINDOW_MILLISECONDS;
    const endTime = startTime + WINDOW_MILLISECONDS;
    const netOf = (points: readonly EquityRecord[]): string =>
      formatEngineDecimal(
        toEngineDecimal(equityBefore(points, endTime, initialBalance)).minus(
          equityBefore(points, startTime, initialBalance),
        ),
      );
    const baselineNet = netOf(baseline);
    const analystNet = netOf(analyst);
    results.push({
      index,
      startTime,
      baselineNet,
      analystNet,
      delta: formatEngineDecimal(toEngineDecimal(analystNet).minus(baselineNet)),
    });
  }
  return results;
}

// D11: "janelas em que o analista ajudou" (resultado líquido da janela com o analista maior que sem) contra "atrapalhou";
// empate não conta. Wilson 95% do `@ativada/statistics` (o único lugar) sobre ajudou ÷ (ajudou + atrapalhou).
export function judgeWindows(windows: readonly WindowResult[]): WindowJudgement {
  const helped = windows.filter((window) => toEngineDecimal(window.delta).gt(0)).length;
  const hurt = windows.filter((window) => toEngineDecimal(window.delta).lt(0)).length;
  const counted = helped + hurt;
  const ties = windows.length - counted;
  if (counted < MINIMUM_COUNTED_WINDOWS) {
    return {
      windows: windows.length,
      helped,
      hurt,
      ties,
      counted,
      lower: null,
      upper: null,
      verdict: WINDOW_VERDICT.TOO_FEW,
    };
  }
  const { lower, upper } = computeWilsonInterval({ successes: helped, total: counted });
  const verdict = toEngineDecimal(lower).gt(HALF)
    ? WINDOW_VERDICT.HELPED
    : toEngineDecimal(upper).lt(HALF)
      ? WINDOW_VERDICT.HURT
      : WINDOW_VERDICT.EVEN;
  return { windows: windows.length, helped, hurt, ties, counted, lower, upper, verdict };
}
