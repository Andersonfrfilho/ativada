// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ENGINE_STATE_VERSION } from './engine.constant.js';
import type {
  ExitReason,
  OrderPurpose,
  OrderSide,
  EntryOrderType,
} from './engine-vocabulary.constant.js';
import type { JsonValue } from './json-value.types.js';

export type OpenPositionState = {
  readonly positionKey: string;
  readonly openedCandleOpenTime: number;
  readonly entryPrice: string;
  readonly quantity: string;
  readonly stopPrice: string;
  readonly targetPrice: string;
  readonly entryFee: string;
};

// No máximo uma: entrada pendente só com a carteira zerada, saída pendente só com posição aberta.
export type PendingOrderState = {
  readonly orderKey: string;
  readonly side: OrderSide;
  readonly type: EntryOrderType;
  readonly purpose: OrderPurpose;
  readonly createdCandleOpenTime: number;
  readonly limitPrice: string | null;
  readonly quoteBudget: string | null;
  readonly stopDistance: string | null;
  readonly targetDistance: string | null;
  readonly eligibleCandles: number | null;
  readonly exitReason: ExitReason | null;
};

export type BenchmarkState = {
  readonly quantity: string;
  readonly cash: string;
};

// Estado imutável e serializável em JSON: retomar dele dá o mesmo resultado da execução contínua.
export type EngineState = {
  readonly version: typeof ENGINE_STATE_VERSION;
  readonly engineVersion: string;
  readonly configHash: string;
  readonly leadInCandles: number;
  readonly processedCandles: number;
  readonly lastCandleOpenTime: number | null;
  readonly sequence: number;
  readonly isHalted: boolean;
  readonly cash: string;
  readonly position: OpenPositionState | null;
  readonly pendingOrder: PendingOrderState | null;
  readonly benchmark: BenchmarkState | null;
  readonly indicators: Readonly<Record<string, JsonValue>>;
};
