// Copyright (c) 2026 Ada Technology. All rights reserved.
export const MILLISECONDS_PER_SECOND = 1_000;

// Páginas de velas para a esquerda (plan D1): 1.000 por pedido e no máximo 20.000 na memória.
export const CANDLE_PAGE_SIZE = 1_000;
export const MAX_CANDLES_IN_MEMORY = 20_000;
// Faltando menos que isto de velas à esquerda da janela visível, a página anterior é pedida.
export const PAGING_EDGE_BARS = 50;

// A abertura do gráfico que acompanha o fim mostra só as últimas velas, como a corretora.
export const INITIAL_VISIBLE_BARS = 150;

// Pontos do cone: a largura cresce com √fração do caminho até o fechamento (plan D1).
export const CONE_STEPS = 12;

export const CHART_LAYER = {
  FORECAST: 'forecast',
  TRADES: 'trades',
  STRATEGY_LINES: 'strategyLines',
  STOP_TARGET: 'stopTarget',
  LEVELS: 'levels',
  WAITED: 'waited',
  // As plaquinhas e as faixas das equipes de modelo ◆ (spec 015); desligada por padrão.
  TEAMS: 'teams',
} as const;

export type ChartLayer = (typeof CHART_LAYER)[keyof typeof CHART_LAYER];

export const MARKER_LABEL = { buy: 'Compra', sell: 'Venda' } as const;

export const CHART_PREFERENCES_STORAGE_KEY = 'ativada.chart-preferences';

// Como a vela aparece em frase ("na vela de 1 h").
export const TIMEFRAME_PHRASE: Readonly<Record<string, string>> = {
  '1m': '1 min',
  '3m': '3 min',
  '15m': '15 min',
  '1h': '1 h',
  '4h': '4 h',
  '1d': '1 dia',
};

// Velas só de exibição (spec 017): nunca são a vela de uma execução; o motor decide sempre na vela da execução.
export const DISPLAY_TIMEFRAMES = ['1m', '3m'] as const;
export type DisplayTimeframe = (typeof DISPLAY_TIMEFRAMES)[number];

// A retenção padrão de cada vela de exibição no ambiente (CANDLE_DISPLAY_1M_RETENTION_DAYS e CANDLE_DISPLAY_RETENTION_DAYS).
const RETENTION_DAYS: Readonly<Record<string, number>> = { '1m': 30, '3m': 90 };

export const DISPLAY_TEXT = {
  NO_ADVANTAGE: 'Mais velas dão mais detalhe visual; não melhoram a previsão nem criam vantagem.',
} as const;

export function describeDisplayLegend(shown: string, run: string): string {
  return `Gráfico em ${TIMEFRAME_PHRASE[shown] ?? shown} · opiniões a cada ${TIMEFRAME_PHRASE[run] ?? run}`;
}

export function describeRetention(timeframe: string): string {
  return `Velas de ${TIMEFRAME_PHRASE[timeframe] ?? timeframe} existem só dos últimos ${RETENTION_DAYS[timeframe] ?? 90} dias.`;
}

// Saídas que o motor decide dentro de uma vela da execução, sem saber o minuto (ADR 0002, V8).
export const BRACKET_EXIT_REASONS: readonly string[] = ['target', 'stop', 'gap'];

// Contexto antes do início da simulação nas velas de exibição: o que for maior entre 40 velas e 2 horas.
export const DISPLAY_CONTEXT_BARS = 40;
export const DISPLAY_CONTEXT_MILLISECONDS = 2 * 3_600_000;
