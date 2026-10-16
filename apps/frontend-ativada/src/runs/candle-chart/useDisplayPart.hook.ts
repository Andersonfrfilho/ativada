// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { LiveCandleView } from '../../live/live-candle.js';
import type { TradeChart } from '../trade-chart.validation.js';
import type { OhlcText } from './ohlc-text.js';
import type { CandleSource } from './useCandleSource.hook.js';
import type { CanvasBase } from './useCanvasBase.hook.js';
import { useDisplayExtras } from './useDisplayExtras.hook.js';

export type DisplayPart = {
  readonly tradeText: string | undefined;
  readonly asideOpenTime: number | undefined;
  readonly opinionText: string | undefined;
  readonly fifteenLegend: OhlcText | undefined;
};

export type DisplayPartParts = {
  readonly base: CanvasBase;
  readonly live: LiveCandleView | undefined;
  readonly point: {
    readonly pointedOpenTime: number | undefined;
    readonly tradeText: string | undefined;
  };
};

function joinTexts(first: string | undefined, second: string | undefined): string | undefined {
  const texts = [first, second].filter((text) => text !== undefined);
  return texts.length === 0 ? undefined : texts.join(' · ');
}

// O que só existe com vela de exibição (spec 017): opinião da vela apontada, colchete da saída e vela de 15 min composta.
export function useDisplayPart(
  input: { readonly chart: TradeChart; readonly source: CandleSource },
  { base, live, point }: DisplayPartParts,
): DisplayPart {
  const extras = useDisplayExtras({
    chart: input.chart,
    source: input.source,
    surface: base.surface,
    pointedOpenTime: point.pointedOpenTime,
    live,
    trades: base.trades,
    timeZone: base.timeZone,
  });
  return {
    tradeText: joinTexts(point.tradeText, extras.bracketText),
    asideOpenTime: extras.decisionOpenTime ?? point.pointedOpenTime,
    opinionText: extras.opinionText,
    fifteenLegend: extras.fifteenLegend,
  };
}
