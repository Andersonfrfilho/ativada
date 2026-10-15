// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatPrice, formatSymbol } from '../format/format.js';
import { formatDayInZone } from '../format/zoned-time.js';
import { buildMarkerTooltip, CLUSTER_ZOOM_HINT, type MarkerFactsParams } from './marker-facts.js';
import { describeCluster, pluralize } from './price-chart-markers.js';
import { findPriceBounds } from './price-chart.js';
import type { ChartCluster, TradeChart } from './trade-chart.validation.js';

const QUOTE_ASSET = 'USDT';
const SHORT_DAY_LENGTH = 5;
const YEAR_SEPARATOR_INDEX = 6;

export type ChartDescriptionParams = {
  readonly chart: TradeChart;
  readonly timeZone: string;
  // A frase da previsão (spec 009, RF20), quando a camada está à vista; `undefined` não acrescenta nada.
  readonly forecast?: string | undefined;
};

function priceText(price: string): string {
  return `${formatPrice(price)} ${QUOTE_ASSET}`;
}

// "01/04" quando os dois dias são do mesmo ano; com ano ("31/12/2025 a 02/01/2026") quando a faixa o atravessa.
function describePeriod(chart: TradeChart, timeZone: string): string {
  const first = formatDayInZone(chart.from, timeZone);
  const last = formatDayInZone(chart.to - 1, timeZone);
  const isSameYear = first.slice(YEAR_SEPARATOR_INDEX) === last.slice(YEAR_SEPARATOR_INDEX);
  return isSameYear
    ? `de ${first.slice(0, SHORT_DAY_LENGTH)} a ${last.slice(0, SHORT_DAY_LENGTH)}`
    : `de ${first} a ${last}`;
}

function describePrices(chart: TradeChart): string {
  const bounds = findPriceBounds(chart.columns);
  const first = chart.columns[0]?.first;
  const last = chart.columns[chart.columns.length - 1]?.last;
  if (bounds === undefined || first === undefined || last === undefined) {
    return 'Ainda não há preços neste período.';
  }
  return (
    `Começou em ${priceText(first)} e terminou em ${priceText(last)}, ` +
    `com mínima de ${priceText(bounds.low)} e máxima de ${priceText(bounds.high)}.`
  );
}

function describeCounts(chart: TradeChart): string {
  const { buys, sells } = chart.totals;
  if (buys === 0 && sells === 0) return 'Nenhuma operação neste período.';
  const counts = `${pluralize(buys, 'compra', 'compras')} e ${pluralize(sells, 'venda', 'vendas')}.`;
  return chart.clusters === null
    ? counts
    : `${counts} As operações estão agrupadas: aproxime o período para ver cada uma.`;
}

// O resumo de leitor de tela: moeda, faixa, preço inicial e final, mínima, máxima, quantas compras e vendas e, na simulação
// ao vivo, a previsão. A tabela de operações é a alternativa acessível completa.
export function describeChart({ chart, timeZone, forecast }: ChartDescriptionParams): string {
  const heading = `Preço de ${formatSymbol(chart.symbol)} ${describePeriod(chart, timeZone)}.`;
  const parts = [heading, describePrices(chart), describeCounts(chart)];
  return (forecast === undefined ? parts : [...parts, forecast]).join(' ');
}

// A frase do marcador é a dica inteira: título e cada campo, na mesma ordem.
export function describeMarker(params: MarkerFactsParams): string {
  const { heading, rows } = buildMarkerTooltip(params);
  return `${heading}: ${rows.map((row) => `${row.label} ${row.value}`).join('; ')}`;
}

export function describeClusterItem(cluster: ChartCluster): string {
  return `${describeCluster(cluster)}. ${CLUSTER_ZOOM_HINT}`;
}
