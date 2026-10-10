// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonContainer, JsonValue } from '../../../packages/database/src/index.js';

export const REASON_TEXT = 'Compra 3/4: tendência, MACD e volume confirmam; RSI neutro';

export type PayloadOverrides = Readonly<Record<string, JsonValue>>;

// O conteúdo que o passo ao vivo grava em `alerts.payload` (esquema estrito do worker).
export function alertPayload(overrides: PayloadOverrides = {}): JsonContainer {
  return {
    symbol: 'BTCUSDT',
    timeframe: '1h',
    closePrice: '64000.1',
    score: '3.5',
    regime: 'trending',
    reason: REASON_TEXT,
    simulatedAction: 'enter',
    stopPrice: '62900',
    targetPrice: '66800.5',
    hitRate: { winRate: '0.583333333333', trades: 24 },
    ...overrides,
  };
}
