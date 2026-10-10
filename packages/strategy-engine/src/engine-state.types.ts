// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ENGINE_STATE_VERSION } from './engine.constant.js';
import type {
  EntryOrderType,
  ExitReason,
  OrderPurpose,
  OrderSide,
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
// A entrada guarda o VALOR EM RISCO; a quantidade nasce no preenchimento (ADR 0002 §c).
// `filledQuantity` reserva o preenchimento parcial da execução real (no simulado é sempre "0").
export type PendingOrderState = {
  readonly orderKey: string;
  readonly side: OrderSide;
  readonly type: EntryOrderType;
  readonly purpose: OrderPurpose;
  readonly createdCandleOpenTime: number;
  readonly limitPrice: string | null;
  readonly riskAmount: string | null;
  readonly stopDistance: string | null;
  readonly targetDistance: string | null;
  readonly eligibleCandles: number | null;
  // Volume do candle de decisão `t`: a participação no volume usa ele, não o do candle de preenchimento.
  readonly decisionVolume: string | null;
  readonly filledQuantity: string;
  readonly exitReason: ExitReason | null;
};

export type BenchmarkState = {
  readonly quantity: string;
  readonly cash: string;
};

// Parte do sinal: depende só de candles e sentimento (indicadores, aquecimento).
export type SignalState = {
  readonly leadInCandles: number;
  readonly processedCandles: number;
  readonly lastCandleOpenTime: number | null;
  readonly indicators: Readonly<Record<string, JsonValue>>;
};

// Parte da carteira: ordens, posição, caixa e régua; `keyPrefix` dá espaço de nome às chaves
// (`w3:order-0` no walk-forward por janela).
export type WalletState = {
  // Carteira avulsa (walk-forward, meta) só aceita sinal e parâmetros da execução que a criou.
  readonly configHash: string;
  readonly runHash: string;
  readonly keyPrefix: string;
  readonly lastCandleOpenTime: number | null;
  readonly firstSignalCandleOpenTime: number | null;
  readonly sequence: number;
  readonly isHalted: boolean;
  // Últimos `commandId` processados, do mais antigo ao mais novo (no máximo 64): repetição é ignorada.
  readonly processedCommandIds: readonly string[];
  readonly cash: string;
  readonly position: OpenPositionState | null;
  readonly pendingOrder: PendingOrderState | null;
  readonly benchmark: BenchmarkState | null;
};

// Estado imutável e serializável em JSON: retomar dele dá o mesmo resultado da execução contínua.
export type EngineState = {
  readonly version: typeof ENGINE_STATE_VERSION;
  readonly engineVersion: string;
  readonly configHash: string;
  readonly runHash: string;
  readonly signal: SignalState;
  readonly wallet: WalletState;
};
