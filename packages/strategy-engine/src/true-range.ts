// Copyright (c) 2026 Ada Technology. All rights reserved.

export type TrueRangeParams = {
  readonly high: number;
  readonly low: number;
  readonly previousClose: number | null;
};

// TR do primeiro candle = máxima − mínima (não há fechamento anterior); depois, o maior entre a
// amplitude e as distâncias da máxima e da mínima ao fechamento anterior (Wilder).
export function trueRangeOf(params: TrueRangeParams): number {
  const { high, low, previousClose } = params;
  const range = high - low;
  if (previousClose === null) return range;
  return Math.max(range, Math.abs(high - previousClose), Math.abs(low - previousClose));
}
