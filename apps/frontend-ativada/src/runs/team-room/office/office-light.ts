// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Decision } from '../../live-tracking/live-status.validation.js';

export const OFFICE_LIGHT = {
  CALM: 'calm',
  CLOSING: 'closing',
  BUY: 'buy',
  PAUSE: 'pause',
} as const;

export type OfficeLight = (typeof OFFICE_LIGHT)[keyof typeof OFFICE_LIGHT];

const CLOSING_WINDOW_MILLISECONDS = 60_000;

export type LightInput = {
  readonly isLocked: boolean;
  readonly outcome: Decision['outcome'] | undefined;
  readonly nextDecisionAt: number | null;
  readonly now: number;
};

// A luz do teto no repouso: âmbar na pausa (a luz nunca é a única pista: há a placa PAUSA), verde na compra, e um tom de
// "fechando" no último minuto da vela.
export function lightOf({ isLocked, outcome, nextDecisionAt, now }: LightInput): OfficeLight {
  if (isLocked) return OFFICE_LIGHT.PAUSE;
  if (outcome === 'bought' || outcome === 'buy_pending') return OFFICE_LIGHT.BUY;
  const isClosing =
    nextDecisionAt !== null &&
    nextDecisionAt - now >= 0 &&
    nextDecisionAt - now <= CLOSING_WINDOW_MILLISECONDS;
  return isClosing ? OFFICE_LIGHT.CLOSING : OFFICE_LIGHT.CALM;
}
