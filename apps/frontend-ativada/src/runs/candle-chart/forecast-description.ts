// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatPriceEdge } from '../../format/format.js';
import { formatMomentSkippingToday } from '../../format/zoned-moment.js';
import { NEXT_CANDLE_TEXT, type NextCandleState } from './next-candle-state.js';
import { STRENGTH_WORD } from './projection-text.js';
import type { AvailableProjection } from './projections.validation.js';

const STANCE_PHRASE: Readonly<Record<AvailableProjection['stance'], string>> = {
  buy: 'comprar',
  hold: 'segurar',
  sell: 'vender',
  stay_out: 'ficar de fora',
};

export type ForecastDescriptionParams = {
  readonly state: NextCandleState;
  readonly now: number;
  readonly timeZone: string;
};

function describeBand(current: AvailableProjection): string {
  if (current.bandLow === null || current.bandHigh === null) return '';
  return `, faixa de ${formatPriceEdge(current.bandLow, 'low')} a ${formatPriceEdge(current.bandHigh, 'high')}`;
}

// A previsão na descrição textual do gráfico (RF20): "Previsão: tende a comprar (fraco) até 05:00, faixa de 12,778 a
// 13,032." Sem tendência, o motivo do servidor. Carregando ou com erro, nada é dito (a tabela segue a alternativa completa).
export function describeForecast({
  state,
  now,
  timeZone,
}: ForecastDescriptionParams): string | undefined {
  if (state.kind === 'unavailable') return `${NEXT_CANDLE_TEXT.NO_FORECAST}: ${state.message}`;
  if (state.kind !== 'available') return undefined;
  const { current } = state;
  const until = formatMomentSkippingToday(current.horizonEndsAt, { now, timeZone });
  const stance = STANCE_PHRASE[current.stance];
  return `Previsão: tende a ${stance} (${STRENGTH_WORD[current.strength]}) até ${until}${describeBand(current)}.`;
}
