// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatPrice, formatPriceEdge } from '../../format/format.js';
import { formatTimeInZone } from '../../format/zoned-time.js';
import type { NextCandleLabels } from './NextCandleChart.component.js';
import { NEXT_CANDLE_TEXT, type NextCandleState, type PanelWindow } from './next-candle-state.js';
import type { AvailableProjection } from './projections.validation.js';

const STANCE_ARROW: Readonly<Record<AvailableProjection['stance'], string>> = {
  buy: '↗ compra',
  hold: '↗ segurar',
  sell: '↘ vender',
  stay_out: '↘ ficar de fora',
};

function edgeOrUndefined(text: string | null, edge: 'low' | 'high'): string | undefined {
  return text === null ? undefined : formatPriceEdge(text, edge);
}

function describeDrawing(state: NextCandleState): string {
  if (state.kind !== 'available') {
    return `Últimas velas e a vela em formação. ${NEXT_CANDLE_TEXT.NO_FORECAST}.`;
  }
  const { current } = state;
  const low = edgeOrUndefined(current.bandLow, 'low');
  const high = edgeOrUndefined(current.bandHigh, 'high');
  const band = low === undefined || high === undefined ? '' : ` Faixa de ${low} a ${high}.`;
  return `Últimas velas e a faixa da próxima vela. ${current.label}.${band}`;
}

export type PanelLabelsParams = {
  readonly state: NextCandleState;
  readonly window: PanelWindow;
  readonly timeZone: string;
};

// Os rótulos do desenho do painel, todos em texto pronto: preços do servidor formatados e as horas no fuso do usuário.
export function buildPanelLabels({ state, window, timeZone }: PanelLabelsParams): NextCandleLabels {
  const current = state.kind === 'available' ? state.current : undefined;
  return {
    description: describeDrawing(state),
    low: edgeOrUndefined(current?.bandLow ?? null, 'low'),
    high: edgeOrUndefined(current?.bandHigh ?? null, 'high'),
    base: current === undefined ? undefined : formatPrice(current.base),
    arrow: current === undefined ? undefined : STANCE_ARROW[current.stance],
    start: formatTimeInZone(window.start, timeZone),
    end: formatTimeInZone(window.end, timeZone),
  };
}
