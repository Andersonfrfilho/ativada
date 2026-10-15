// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatDecimalText, parseScaled } from '../../format/decimal.js';
import type { ChartDecision } from '../trade-chart.validation.js';
import type { Trade } from '../run.validation.js';
import { CANDLE_PAGE_SIZE } from './candle-chart.constant.js';
import { toDrawingNumber, toSurfaceTime } from './candle-series.js';
import type { PageRange } from './candle-paging.js';
import type { SurfaceLevelBox, SurfaceTime } from './chart-surface.types.js';
import type { LayerThreshold } from './strategy-layers.validation.js';

// Quantas velas por bloco o centro visível anda antes de as camadas pedirem outra janela.
export const LAYERS_BLOCK_BARS = 250;
const LAYERS_WINDOW_BEFORE_BARS = 375;
const MINUS_SIGN = '−';

export type LayersWindowParams = {
  // O instante (ms) da vela no centro do que está visível.
  readonly centerTime: number;
  readonly extent: PageRange;
  readonly timeframeMilliseconds: number;
};

// A janela das camadas: no máximo 1.000 velas (o teto da API) em volta do centro visível, andando em blocos para não
// pedir de novo a cada arrasto, e sempre dentro do período da execução (fora dele a API responde 400).
export function computeLayersWindow(params: LayersWindowParams): PageRange | undefined {
  const { centerTime, extent, timeframeMilliseconds: duration } = params;
  if (duration <= 0) return undefined;
  const block = Math.floor(centerTime / (LAYERS_BLOCK_BARS * duration));
  const start = block * LAYERS_BLOCK_BARS * duration - LAYERS_WINDOW_BEFORE_BARS * duration;
  const from = Math.max(extent.from, start);
  const to = Math.min(extent.to, start + CANDLE_PAGE_SIZE * duration);
  return to > from ? { from, to } : undefined;
}

// O stop e o alvo de cada operação: uma caixa da entrada ao alvo e outra da entrada ao stop, até a saída (ou a ponta).
export function toLevelBoxes(trades: readonly Trade[]): SurfaceLevelBox[] {
  return trades.flatMap((trade) => {
    if (trade.stopPrice === undefined || trade.targetPrice === undefined) return [];
    return [
      {
        key: trade.engineKey,
        entryTime: toSurfaceTime(trade.openedCandleTime),
        exitTime:
          trade.closedCandleTime === undefined ? null : toSurfaceTime(trade.closedCandleTime),
        entry: toDrawingNumber(trade.entryPrice),
        stop: toDrawingNumber(trade.stopPrice),
        target: toDrawingNumber(trade.targetPrice),
      },
    ];
  });
}

// Os pontinhos de "esperou": uma vela por decisão de esperar (só a simulação ao vivo, até 500 velas na faixa).
export function toWaitedTimes(decisions: readonly ChartDecision[] | null): SurfaceTime[] {
  if (decisions === null) return [];
  return decisions
    .filter((decision) => decision.outcome === 'waited')
    .map((decision) => toSurfaceTime(decision.candleTime));
}

// "+2" ou "−2" (sinal de menos de verdade), com vírgula decimal; limiar ilegível não vira número inventado.
export function formatThreshold(threshold: string): string {
  const scaled = parseScaled(threshold);
  if (scaled === undefined) return '—';
  const magnitude = formatDecimalText(threshold.replace('-', ''), {
    minimumFraction: 0,
    maximumFraction: 2,
  });
  if (scaled === 0n) return magnitude;
  return `${scaled < 0n ? MINUS_SIGN : '+'}${magnitude}`;
}

// O rótulo do painel do placar (RF07), com os limiares do último trecho: "compra em +2, venda em −2".
export function describeScorePanel(thresholds: readonly LayerThreshold[]): string {
  const last = thresholds.at(-1);
  if (last === undefined) return 'Placar da estratégia';
  return `Placar da estratégia — compra em ${formatThreshold(last.buy)}, venda em ${formatThreshold(last.sell)}`;
}
