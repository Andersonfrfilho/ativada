// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatSignedScaled, formatSignedScaledPercent, parseScaled } from '../format/decimal.js';
import { formatDecimal, formatPrice, formatQuantity } from '../format/format.js';
import { formatInZone, zoneLabel } from '../format/zoned-time.js';
import { clusterKey, describeCluster, markerKey } from './price-chart-markers.js';
import type { ChartCluster, ChartMarker, TradeChart } from './trade-chart.validation.js';

export const CLUSTER_ZOOM_HINT = 'Aproxime para ver cada operação';

const QUOTE_ASSET = 'USDT';

export type TooltipRow = { readonly label: string; readonly value: string };

export type TooltipContent = {
  readonly heading: string;
  readonly tone: 'buy' | 'sell' | 'cluster';
  readonly rows: readonly TooltipRow[];
  readonly note: string | undefined;
};

export type MarkerFactsParams = {
  readonly marker: ChartMarker;
  readonly symbol: string;
  readonly timeZone: string;
};

function baseAsset(symbol: string): string {
  return symbol.endsWith(QUOTE_ASSET) ? symbol.slice(0, -QUOTE_ASSET.length) : symbol;
}

function money(text: string): string {
  return `${formatDecimal(text)} ${QUOTE_ASSET}`;
}

// Hora no fuso do usuário SEMPRE com o deslocamento ao lado: "04/04/2026 11:00 (GMT−3)".
export function formatMoment(milliseconds: number, timeZone: string): string {
  return `${formatInZone(milliseconds, timeZone)} (${zoneLabel(timeZone, milliseconds)})`;
}

function formatOutcome(marker: ChartMarker): string | undefined {
  const profit = marker.netProfit === undefined ? undefined : parseScaled(marker.netProfit);
  if (profit === undefined) return undefined;
  const rate = marker.netProfitRate === undefined ? undefined : parseScaled(marker.netProfitRate);
  const percent = rate === undefined ? '' : ` (${formatSignedScaledPercent(rate)})`;
  return `${formatSignedScaled(profit)} ${QUOTE_ASSET}${percent}`;
}

// Só texto que veio do servidor, formatado em texto decimal: nenhum `Number` toca em dinheiro.
export function buildMarkerTooltip(params: MarkerFactsParams): TooltipContent {
  const { marker, symbol, timeZone } = params;
  const isBuy = marker.side === 'buy';
  const outcome = isBuy ? undefined : formatOutcome(marker);
  const rows: TooltipRow[] = [
    { label: 'Quando', value: formatMoment(marker.candleTime, timeZone) },
    { label: 'Preço', value: `${formatPrice(marker.price)} ${QUOTE_ASSET}` },
    { label: 'Quantidade', value: `${formatQuantity(marker.quantity)} ${baseAsset(symbol)}` },
    { label: isBuy ? 'Valor pago' : 'Valor recebido', value: money(marker.amount) },
    { label: 'Taxa', value: money(marker.fee) },
    ...(outcome === undefined ? [] : [{ label: 'Resultado', value: outcome }]),
  ];
  return { heading: isBuy ? 'Compra' : 'Venda', tone: marker.side, rows, note: undefined };
}

export function buildClusterTooltip(cluster: ChartCluster, timeZone: string): TooltipContent {
  const rows: TooltipRow[] = [
    { label: 'Compras', value: String(cluster.buys) },
    { label: 'Vendas', value: String(cluster.sells) },
    { label: 'Período', value: `a partir de ${formatMoment(cluster.startTime, timeZone)}` },
  ];
  return {
    heading: describeCluster(cluster),
    tone: 'cluster',
    rows,
    note: CLUSTER_ZOOM_HINT,
  };
}

export type ResolveTooltipParams = {
  readonly chart: TradeChart;
  readonly activeKey: string | undefined;
  readonly timeZone: string;
};

export function resolveTooltip(params: ResolveTooltipParams): TooltipContent | undefined {
  const { chart, activeKey, timeZone } = params;
  if (activeKey === undefined) return undefined;
  const marker = chart.markers?.find((item) => markerKey(item) === activeKey);
  if (marker !== undefined) {
    return buildMarkerTooltip({ marker, symbol: chart.symbol, timeZone });
  }
  const cluster = chart.clusters?.find((item) => clusterKey(item) === activeKey);
  return cluster === undefined ? undefined : buildClusterTooltip(cluster, timeZone);
}

// Frase para o leitor de tela: o título e cada campo da dica, na mesma ordem.
export function describeMarker(params: MarkerFactsParams): string {
  const { heading, rows } = buildMarkerTooltip(params);
  return `${heading}: ${rows.map((row) => `${row.label} ${row.value}`).join('; ')}`;
}

export function describeClusterItem(cluster: ChartCluster): string {
  return `${describeCluster(cluster)}. ${CLUSTER_ZOOM_HINT}`;
}
