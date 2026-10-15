// Copyright (c) 2026 Ada Technology. All rights reserved.
export const MILLISECONDS_PER_SECOND = 1_000;

// Páginas de velas para a esquerda (plan D1): 1.000 por pedido e no máximo 20.000 na memória.
export const CANDLE_PAGE_SIZE = 1_000;
export const MAX_CANDLES_IN_MEMORY = 20_000;
// Faltando menos que isto de velas à esquerda da janela visível, a página anterior é pedida.
export const PAGING_EDGE_BARS = 50;

// Pontos do cone: a largura cresce com √fração do caminho até o fechamento (plan D1).
export const CONE_STEPS = 12;

export const CHART_LAYER = {
  FORECAST: 'forecast',
  TRADES: 'trades',
  STRATEGY_LINES: 'strategyLines',
  STOP_TARGET: 'stopTarget',
  WAITED: 'waited',
} as const;

export type ChartLayer = (typeof CHART_LAYER)[keyof typeof CHART_LAYER];

export const MARKER_LABEL = { buy: 'Compra', sell: 'Venda' } as const;

export const CHART_PREFERENCES_STORAGE_KEY = 'ativada.chart-preferences';
