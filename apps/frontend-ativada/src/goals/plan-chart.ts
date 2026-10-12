// Copyright (c) 2026 Ada Technology. All rights reserved.
const MARGIN = 12;
const PRICE_PADDING_RATIO = 0.06;

export type PlanChartParams = {
  readonly width: number;
  readonly height: number;
  readonly prices: readonly number[];
  readonly times: readonly number[];
};

export type PlanChartScale = {
  readonly x: (time: number) => number;
  readonly y: (price: number) => number;
};

function span(values: readonly number[]): { readonly low: number; readonly high: number } {
  return { low: Math.min(...values), high: Math.max(...values) };
}

// Preço maior fica mais alto na tela (y menor); intervalo achatado vai para o meio em vez de dividir por zero.
export function mapPlanChart(params: PlanChartParams): PlanChartScale {
  const prices = span(params.prices);
  const times = span(params.times);
  const pad = (prices.high - prices.low) * PRICE_PADDING_RATIO;
  const low = prices.low - pad;
  const high = prices.high + pad;
  const innerWidth = params.width - 2 * MARGIN;
  const innerHeight = params.height - 2 * MARGIN;
  return {
    x: (time) =>
      times.high === times.low
        ? params.width / 2
        : MARGIN + ((time - times.low) / (times.high - times.low)) * innerWidth,
    y: (price) =>
      high === low ? params.height / 2 : MARGIN + (1 - (price - low) / (high - low)) * innerHeight,
  };
}
