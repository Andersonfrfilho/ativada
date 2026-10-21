// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  divideFloor,
  formatSignedPercentDown,
  parseScaled,
  toPlainText,
} from '../../format/decimal.js';
import { formatPrice } from '../../format/format.js';
import type { LiveStatus } from '../live-tracking/live-status.validation.js';

export type OpenPosition = NonNullable<LiveStatus['openPosition']>;

export type DistanceRow = { readonly label: string; readonly value: string };

// "+1,25 · +10,00%": a diferença em valor e em porcentagem do fechamento, só com inteiros (nada de `Number` para dinheiro).
function distanceText(close: bigint, level: string): string | undefined {
  const target = parseScaled(level);
  if (target === undefined) return undefined;
  const difference = target - close;
  const rate = divideFloor(difference, close);
  if (rate === undefined) return undefined;
  const sign = difference > 0n ? '+' : '';
  return `${sign}${formatPrice(toPlainText(difference))} · ${formatSignedPercentDown(rate)}`;
}

// Da vela apontada até o alvo e a proteção da posição aberta; antes de a posição abrir, ou sem número legível, nada.
export function describePositionDistance(
  position: OpenPosition | undefined,
  candle: { readonly openTime: number; readonly close: string },
): readonly DistanceRow[] {
  if (position === undefined || candle.openTime < position.openedCandleTime) return [];
  const close = parseScaled(candle.close);
  if (close === undefined) return [];
  const target = distanceText(close, position.targetPrice);
  const stop = distanceText(close, position.stopPrice);
  return [
    ...(target === undefined ? [] : [{ label: 'Até o alvo', value: target }]),
    ...(stop === undefined ? [] : [{ label: 'Até a proteção', value: stop }]),
  ];
}
