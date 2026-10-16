// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect } from 'react';

import { parseScaled } from '../../format/decimal.js';
import { formatTimeInZone } from '../../format/zoned-time.js';
import type { LiveCandleView } from '../../live/live-candle.js';
import type { StreamCandle } from '../../live/stream.validation.js';
import { useLiveCandle } from '../../live/useLiveCandle.hook.js';
import type { Trade } from '../run.validation.js';
import type { TradeChart } from '../trade-chart.validation.js';
import type { ChartSurface } from './chart-surface.types.js';
import { composeCandles, pickWindowCandles } from './compose-candles.js';
import {
  bucketOf,
  decidedOpenAt,
  listExitBrackets,
  opinionWindowAt,
  type DisplayMapping,
} from './display-mapping.js';
import { describeBracketAt } from './marker-series.js';
import type { MarketCandle } from './market-candles.validation.js';
import { buildOhlcText, type OhlcText } from './ohlc-text.js';
import type { CandleSource } from './useCandleSource.hook.js';

const MILLISECONDS_PER_SECOND = 1_000;

export type DisplayExtrasInput = {
  readonly chart: TradeChart;
  readonly source: CandleSource;
  readonly surface: ChartSurface | undefined;
  // A vela de exibição apontada pela cruz; sem ela, a última.
  readonly pointedOpenTime: number | undefined;
  // A vela de exibição em formação (stream), quando o gráfico acompanha o fim.
  readonly live: LiveCandleView | undefined;
  readonly trades: readonly Trade[];
  readonly timeZone: string;
};

export type DisplayExtras = {
  // "Opinião das 10:15 · vale até 10:30" da vela apontada.
  readonly opinionText: string | undefined;
  // "Saiu pela proteção entre 10:15 e 10:30 (...)" quando a vela apontada está no colchete de uma saída.
  readonly bracketText: string | undefined;
  // A legenda da vela de 15 min em formação, composta das velas de exibição (ou da kline de 15 min).
  readonly fifteenLegend: OhlcText | undefined;
  // A abertura da vela decidida cuja opinião valia na vela apontada (a equipe fala dela).
  readonly decisionOpenTime: number | undefined;
};

const NOTHING: DisplayExtras = {
  opinionText: undefined,
  bracketText: undefined,
  fifteenLegend: undefined,
  decisionOpenTime: undefined,
};

// A kline de exibição não traz o número de negócios; basta saber se houve volume para valer a regra da vela sem negócio.
function fromStream(candle: StreamCandle, durationMilliseconds: number): MarketCandle {
  const hasVolume = (parseScaled(candle.volume) ?? 0n) > 0n;
  return {
    openTime: candle.openTime,
    closeTime: candle.openTime + durationMilliseconds - 1,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    tradeCount: hasVolume ? 1 : 0,
  };
}

type FormingParams = {
  readonly source: CandleSource;
  readonly mapping: DisplayMapping;
  readonly live: LiveCandleView | undefined;
  readonly live15: LiveCandleView | undefined;
};

// A vela de 15 min em formação: a kline de 15 min quando chega (D5), senão a composição das velas de exibição.
function formingRunCandle(
  params: FormingParams,
): { candle: MarketCandle; from: number } | undefined {
  const { source, mapping, live, live15 } = params;
  const forming = live?.status === 'forming' ? live.candle : undefined;
  if (live15?.status === 'forming') {
    const { candle } = live15;
    const from = candle.openTime;
    return { candle: fromStream(candle, mapping.runMilliseconds), from };
  }
  if (forming === undefined) return undefined;
  const from = bucketOf(forming.openTime, mapping.runMilliseconds);
  const window = { openTime: from, closeTime: from + mapping.runMilliseconds - 1 };
  const closed = pickWindowCandles(source.history.candles, window).filter(
    (candle) => candle.openTime !== forming.openTime,
  );
  const candle = composeCandles(
    [...closed, fromStream(forming, mapping.displayMilliseconds)],
    window,
  );
  return candle === undefined ? undefined : { candle, from };
}

function fifteenLegendOf(params: FormingParams & DisplayExtrasInput): OhlcText | undefined {
  const { chart, timeZone, mapping } = params;
  const forming = formingRunCandle(params);
  if (forming === undefined) return undefined;
  const text = buildOhlcText({
    candle: forming.candle,
    previousClose: undefined,
    symbol: chart.symbol,
    timeframe: chart.timeframe,
    timeZone,
    isForming: false,
  });
  const range = `${formatTimeInZone(forming.from, timeZone)}–${formatTimeInZone(forming.from + mapping.runMilliseconds, timeZone)}`;
  return { ...text, title: `Vela de 15 min em formação (${range})` };
}

function useFormingSlot(
  surface: ChartSurface | undefined,
  mapping: DisplayMapping | undefined,
  live: LiveCandleView | undefined,
): void {
  const openTime = live?.status === 'forming' ? live.candle.openTime : undefined;
  useEffect(() => {
    if (mapping === undefined || openTime === undefined) {
      surface?.setFormingSlot(null);
      return;
    }
    const from = bucketOf(openTime, mapping.runMilliseconds);
    surface?.setFormingSlot({
      from: from / MILLISECONDS_PER_SECOND,
      to: (from + mapping.runMilliseconds) / MILLISECONDS_PER_SECOND,
      barSeconds: mapping.displayMilliseconds / MILLISECONDS_PER_SECOND,
    });
  }, [surface, mapping, openTime]);
}

// O que só existe quando a vela mostrada é de exibição (3 min sobre 15 min): a opinião que valia na vela apontada, o colchete
// da saída, a vela de 15 min em formação composta e a faixa dela alinhada às 5 velas. Sem o mapeamento, nada disto existe.
export function useDisplayExtras(input: DisplayExtrasInput): DisplayExtras {
  const { chart, source, surface, pointedOpenTime, live, trades, timeZone } = input;
  const mapping = source.displayMapping;
  const live15 = useLiveCandle(chart.symbol, chart.timeframe);
  useFormingSlot(surface, mapping, live);
  if (mapping === undefined) return NOTHING;
  const shown = pointedOpenTime ?? source.history.candles.at(-1)?.openTime;
  const window = shown === undefined ? undefined : opinionWindowAt(shown, mapping);
  const clock = (milliseconds: number): string => formatTimeInZone(milliseconds, timeZone);
  const brackets = listExitBrackets(trades, mapping);
  return {
    opinionText:
      window === undefined
        ? undefined
        : `Opinião das ${clock(window.issuedAt)} · vale até ${clock(window.validUntil)}`,
    bracketText:
      pointedOpenTime === undefined
        ? undefined
        : describeBracketAt({
            brackets,
            shownOpen: pointedOpenTime,
            formatTime: clock,
          }),
    fifteenLegend: fifteenLegendOf({ ...input, mapping, live15 }),
    decisionOpenTime:
      pointedOpenTime === undefined ? undefined : decidedOpenAt(pointedOpenTime, mapping),
  };
}
