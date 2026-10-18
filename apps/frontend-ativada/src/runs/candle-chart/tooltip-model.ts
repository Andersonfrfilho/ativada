// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatDecimalText, formatSignedPercentDown, parseScaled } from '../../format/decimal.js';
import { formatPrice } from '../../format/format.js';
import { formatInZone, formatTimeInZone } from '../../format/zoned-time.js';
import type { ChartDecision, ChartMarker } from '../trade-chart.validation.js';
import { MARKER_LABEL, TIMEFRAME_PHRASE } from './candle-chart.constant.js';
import { decidedOpenAt, opinionWindowAt, type DisplayMapping } from './display-mapping.js';
import { formatThreshold } from './layer-series.js';
import type { MarketCandle } from './market-candles.validation.js';
import { buildOhlcText, type OhlcText } from './ohlc-text.js';
import { describePositionDistance, type OpenPosition } from './position-distance.js';
import type { StrategyLayers } from './strategy-layers.validation.js';

export type TooltipRow = { readonly label: string; readonly value: string };

export type TooltipModel = {
  // "16/10/2026 17:51 · vela de 3 min": distinto da legenda do topo, que já traz o par.
  readonly title: string;
  readonly ohlc: OhlcText;
  // "Dentro da vela de 15 min das 10:15 (opinião válida até 10:30)" quando a vela mostrada é de exibição.
  readonly context: string | undefined;
  readonly rows: readonly TooltipRow[];
  // Frases curtas: o que a estratégia decidiu e as operações da vela.
  readonly notes: readonly string[];
};

export type TooltipParams = {
  readonly candle: MarketCandle;
  readonly previousClose: string | undefined;
  readonly symbol: string;
  readonly timeframe: string;
  readonly timeZone: string;
  readonly layers: StrategyLayers | undefined;
  readonly decisions: readonly ChartDecision[] | null;
  readonly markers: readonly ChartMarker[] | null;
  readonly mapping: DisplayMapping | undefined;
  readonly durationMilliseconds: number;
  // A frase do colchete de uma saída decidida dentro da vela de 15 min, quando a vela apontada está nele.
  readonly bracketText: string | undefined;
  // A posição aberta da simulação ao vivo (alvo e proteção); `undefined` sem posição.
  readonly openPosition: OpenPosition | undefined;
  // A recomendação de cada equipe ◆ na vela decidida (camada "Equipes ◆" ligada); ausente, o balão não a menciona.
  readonly teamNotes?: ReadonlyMap<number, readonly string[]> | undefined;
};

const OUTCOME_WORD: Readonly<Record<ChartDecision['outcome'], string>> = {
  waited: 'esperou',
  bought: 'comprou',
  buy_pending: 'pediu a compra',
  sold: 'vendeu',
  exited: 'saiu da posição',
};

const QUANTITY_FRACTION = 4;
const FEE_FRACTION = 4;

// Posição da vela `time` em `times` (ordenado); -1 quando a camada não a cobre.
export function indexOfTime(times: readonly number[], time: number): number {
  let low = 0;
  let high = times.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const value = times[middle] ?? 0;
    if (value === time) return middle;
    if (value < time) low = middle + 1;
    else high = middle - 1;
  }
  return -1;
}

// O rótulo da linha sem os parâmetros entre parênteses: o balão é estreito e o nome inteiro está na legenda do gráfico.
function shortLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)/g, '');
}

function lineRows(layers: StrategyLayers, index: number): TooltipRow[] {
  return layers.lines.flatMap((line) => {
    const value = line.values[index];
    return value === null || value === undefined
      ? []
      : [{ label: shortLabel(line.label), value: formatPrice(value) }];
  });
}

function scoreRow(layers: StrategyLayers, index: number): TooltipRow | undefined {
  const score = layers.score[index];
  return score === undefined ? undefined : { label: 'Placar', value: formatThreshold(score) };
}

// A regra do placar vai numa frase à parte: valor comprido na coluna dos números espremeria os rótulos.
function scoreRuleNote(layers: StrategyLayers | undefined, time: number): string | undefined {
  const segment = layers?.thresholds.find((item) => time >= item.from && time <= item.to);
  if (segment === undefined) return undefined;
  return `Regra do placar: compra em ${formatThreshold(segment.buy)}, venda em ${formatThreshold(segment.sell)}.`;
}

function layerRows(layers: StrategyLayers | undefined, time: number): TooltipRow[] {
  if (layers === undefined) return [];
  const index = indexOfTime(layers.candleTimes, time);
  if (index < 0) return [];
  const score = scoreRow(layers, index);
  return [...lineRows(layers, index), ...(score === undefined ? [] : [score])];
}

function decisionNote(params: TooltipParams): string | undefined {
  const { decisions, candle, mapping } = params;
  if (decisions === null) return undefined;
  const decidedOpen =
    mapping === undefined ? candle.openTime : decidedOpenAt(candle.openTime, mapping);
  const found = decisions.find((decision) => decision.candleTime === decidedOpen);
  if (found === undefined) return undefined;
  const word = OUTCOME_WORD[found.outcome];
  return `A estratégia, na vela de 15 min decidida, ${word} (placar ${formatThreshold(found.score)}).`;
}

function teamNotes(params: TooltipParams): readonly string[] {
  const { teamNotes: notes, candle, mapping } = params;
  if (notes === undefined) return [];
  const decidedOpen =
    mapping === undefined ? candle.openTime : decidedOpenAt(candle.openTime, mapping);
  return notes.get(decidedOpen) ?? [];
}

function percentOf(rate: string | undefined): string {
  const scaled = rate === undefined ? undefined : parseScaled(rate);
  return scaled === undefined ? '' : ` · ${formatSignedPercentDown(scaled)}`;
}

function markerNote(marker: ChartMarker, symbol: string): string {
  const [base = '', quote = ''] = symbol.split('/');
  const price = formatPrice(marker.price);
  if (marker.side === 'sell')
    return `${MARKER_LABEL.sell} a ${price}${percentOf(marker.netProfitRate)}`;
  const quantity = formatDecimalText(marker.quantity, {
    minimumFraction: 0,
    maximumFraction: QUANTITY_FRACTION,
  });
  const fee = formatDecimalText(marker.fee, { minimumFraction: 2, maximumFraction: FEE_FRACTION });
  return `${MARKER_LABEL.buy} a ${price} · ${quantity} ${base} · taxa ${fee} ${quote}`;
}

function tradeNotes(params: TooltipParams): string[] {
  const { markers, candle, durationMilliseconds, symbol } = params;
  const open = Math.floor(candle.openTime / durationMilliseconds) * durationMilliseconds;
  return (markers ?? [])
    .filter(
      (marker) =>
        Math.floor(marker.candleTime / durationMilliseconds) * durationMilliseconds === open,
    )
    .map((marker) => markerNote(marker, symbol));
}

function contextOf(params: TooltipParams): string | undefined {
  const { mapping, candle, timeZone } = params;
  if (mapping === undefined) return undefined;
  const window = opinionWindowAt(candle.openTime, mapping);
  const clock = (milliseconds: number): string => formatTimeInZone(milliseconds, timeZone);
  return `Dentro da vela de 15 min das ${clock(window.issuedAt)} (opinião vale até ${clock(window.validUntil)})`;
}

// O que o balão mostra para a vela apontada: o mesmo texto decimal do servidor, sem conversão para número.
export function buildTooltipModel(params: TooltipParams): TooltipModel {
  const { candle, previousClose, symbol, timeframe, timeZone } = params;
  const ohlc = buildOhlcText({
    candle,
    previousClose,
    symbol,
    timeframe,
    timeZone,
    isForming: false,
  });
  const notes = [
    scoreRuleNote(params.layers, candle.openTime),
    decisionNote(params),
    ...tradeNotes(params),
    ...teamNotes(params),
    params.bracketText,
  ];
  const phrase = TIMEFRAME_PHRASE[timeframe] ?? timeframe;
  return {
    title: `${formatInZone(candle.openTime, timeZone)} · vela de ${phrase}`,
    ohlc,
    context: contextOf(params),
    rows: [
      ...layerRows(params.layers, candle.openTime),
      ...describePositionDistance(params.openPosition, candle),
    ],
    notes: notes.filter((note) => note !== undefined),
  };
}

// Posição da vela de abertura `openTime` na lista (ordenada); -1 quando não está carregada.
export function indexOfOpenTime(candles: readonly MarketCandle[], openTime: number): number {
  let low = 0;
  let high = candles.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const value = candles[middle]?.openTime ?? 0;
    if (value === openTime) return middle;
    if (value < openTime) low = middle + 1;
    else high = middle - 1;
  }
  return -1;
}
