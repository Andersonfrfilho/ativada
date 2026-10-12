// Copyright (c) 2026 Ada Technology. All rights reserved.
import { buildUnfillableKey } from '../stream/gap-recovery.js';
import type { GapConfirmation } from './live-run.types.js';

// Lacuna CONFIRMADA (ADR 0002 §a) é a que a recuperação do stream já tentou no REST e a Binance não tem: ela guarda
// essas aberturas em `unfillable`. Candle que só "ainda não chegou" nunca vira lacuna: a simulação espera por ele.
export function createGapConfirmation(unfillable: ReadonlySet<string>): GapConfirmation {
  return ({ symbol, timeframe, openTimes }): boolean =>
    openTimes.every((openTime) =>
      unfillable.has(buildUnfillableKey({ symbol, timeframe }, openTime)),
    );
}
