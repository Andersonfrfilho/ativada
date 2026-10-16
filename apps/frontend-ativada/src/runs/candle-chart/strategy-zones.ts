// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseScaled } from '../../format/decimal.js';
import { formatPrice } from '../../format/format.js';
import type { LiveStatus } from '../live-tracking/live-status.validation.js';
import { toDrawingNumber } from './candle-series.js';
import type { SurfaceZone } from './chart-surface.types.js';

export const ZONES_LEAD =
  'Faixa da estratégia nesta simulação — não é recomendação para você operar.';
export const ZONES_WAITING = 'A faixa aparece quando a estratégia tiver leitura.';

export type StrategyZones = {
  readonly zones: readonly SurfaceZone[];
  // Sem faixa para desenhar: o porquê, em frase.
  readonly reason: string | undefined;
};

type Pair = { readonly low: string; readonly high: string };

function ordered(first: string, second: string): Pair | undefined {
  const left = parseScaled(first);
  const right = parseScaled(second);
  if (left === undefined || right === undefined) return undefined;
  return left <= right ? { low: first, high: second } : { low: second, high: first };
}

function zoneOf(kind: SurfaceZone['kind'], pair: Pair, title: string): SurfaceZone {
  return {
    key: kind,
    kind,
    low: toDrawingNumber(pair.low),
    high: toDrawingNumber(pair.high),
    label: `${title} ${formatPrice(pair.low)}–${formatPrice(pair.high)}`,
  };
}

function holdingZones(position: NonNullable<LiveStatus['openPosition']>): readonly SurfaceZone[] {
  const sell = ordered(position.entryPrice, position.targetPrice);
  const protection = ordered(position.stopPrice, position.entryPrice);
  return [
    ...(sell === undefined ? [] : [zoneOf('sell', sell, 'Faixa de venda:')]),
    ...(protection === undefined
      ? []
      : [
          {
            ...zoneOf('protection', protection, 'Proteção:'),
            label: `Proteção: se cair abaixo de ${formatPrice(position.stopPrice)} vende`,
          },
        ]),
  ];
}

// Sem posição: da última vela fechada até o preço em que a regra de preço passa a votar a favor (o que falta para comprar).
function buyZones(status: LiveStatus): readonly SurfaceZone[] {
  const { triggers } = status;
  if (triggers.status !== 'available' || triggers.state !== 'awaiting_entry') return [];
  const rule = triggers.rules.find(
    (candidate) =>
      candidate.metric === 'close_price' && candidate.threshold !== null && !candidate.isMet,
  );
  const close = status.decisions.items[0]?.close;
  if (rule === undefined || rule.threshold === null || close === undefined) return [];
  const pair = ordered(close, rule.threshold);
  return pair === undefined ? [] : [zoneOf('buy', pair, 'Faixa de compra da estratégia')];
}

// As faixas da camada "Níveis": o que o servidor já devolveu (posição aberta, limiares das regras e a última vela). Nada é
// recalculado; sem leitura, nenhuma faixa e o motivo.
export function buildStrategyZones(status: LiveStatus): StrategyZones {
  const zones = status.openPosition === null ? buyZones(status) : holdingZones(status.openPosition);
  return { zones, reason: zones.length === 0 ? ZONES_WAITING : undefined };
}
