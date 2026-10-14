// Copyright (c) 2026 Ada Technology. All rights reserved.

// Taxas e diferenças saem do servidor com 12 casas (ADR 0002, spec 008, L6 e L7); o texto exibido usa 2.
export const LIVE_RATE_DECIMAL_PLACES = 12;
export const PERCENT_MULTIPLIER = 100;

// Abaixo de 0,01 ponto percentual de diferença a estratégia está "empatada" com comprar e segurar (L7).
export const EVEN_DIFFERENCE_POINTS = '0.01';

export const BUY_AND_HOLD_COMPARISON = { ABOVE: 'above', BELOW: 'below', EVEN: 'even' } as const;
export type BuyAndHoldComparison =
  (typeof BUY_AND_HOLD_COMPARISON)[keyof typeof BUY_AND_HOLD_COMPARISON];
