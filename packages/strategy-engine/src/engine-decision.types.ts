// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SentimentObservation } from './engine-candle.types.js';
import type {
  CommandKind,
  CommandReason,
  ExitReason,
  OrderEventReason,
  OrderPurpose,
  OrderSide,
  OrderStatus,
  OrderType,
  Regime,
  SignalAction,
  StrategyFamily,
} from './engine-vocabulary.constant.js';

// Todo decimal (preço, quantidade, saldo, taxa, pontuação, peso) sai como texto canônico.
export type SignalVote = {
  readonly ruleId: string;
  readonly family: StrategyFamily;
  readonly vote: -1 | 0 | 1;
  readonly weight: string;
  readonly isMissing: boolean;
};

// `indicators` usa os ids com espaço de nome (`rule:<id>`, `risk:atr`, `regime:adx`) e achata os de
// várias saídas (`rule:macd-12-26-9.signal`); `sentiment` é a observação usada (nula se ausente/velha).
export type SignalDecision = {
  readonly candleOpenTime: number;
  // Hash da versão da estratégia que decidiu e lacuna confirmada que o passo atravessou: o `walletStep`
  // avulso confere os dois (outra estratégia, candle não contíguo) em vez de confiar no chamador.
  readonly configHash: string;
  readonly confirmedGapCandles: number;
  readonly action: SignalAction;
  readonly score: string;
  readonly regime: Regime;
  readonly votes: readonly SignalVote[];
  readonly indicators: Readonly<Record<string, number | null>>;
  readonly sentiment: SentimentObservation | null;
  readonly reason: string;
};

// Evento do ciclo de vida da ordem; o chamador grava a ordem por `orderKey` com status monotônico.
// `price`/`quantity` só no `filled`; `triggerPrice` é o stop ou o alvo de uma saída protetora.
export type OrderEvent = {
  readonly orderKey: string;
  readonly candleOpenTime: number;
  readonly status: OrderStatus;
  readonly side: OrderSide;
  readonly type: OrderType;
  readonly purpose: OrderPurpose;
  readonly createdCandleOpenTime: number;
  readonly limitPrice: string | null;
  readonly triggerPrice: string | null;
  readonly price: string | null;
  readonly quantity: string | null;
  readonly riskAmount: string | null;
  readonly stopDistance: string | null;
  readonly targetDistance: string | null;
  readonly eligibleCandles: number | null;
  readonly reason: OrderEventReason | null;
};

export type FillDecision = {
  readonly orderKey: string;
  readonly positionKey: string;
  readonly candleOpenTime: number;
  readonly side: OrderSide;
  readonly price: string;
  readonly quantity: string;
  readonly notional: string;
  readonly fee: string;
};

export type OpenedPositionDecision = {
  readonly positionKey: string;
  readonly candleOpenTime: number;
  readonly entryPrice: string;
  readonly quantity: string;
  readonly stopPrice: string;
  readonly targetPrice: string;
  readonly entryFee: string;
};

export type ClosedPositionDecision = {
  readonly positionKey: string;
  readonly openedCandleOpenTime: number;
  readonly candleOpenTime: number;
  readonly entryPrice: string;
  readonly exitPrice: string;
  readonly quantity: string;
  readonly entryFee: string;
  readonly exitFee: string;
  readonly netProfit: string;
  readonly exitReason: ExitReason;
};

// Patrimônio a valor de liquidação no fechamento e na mínima (lado pior, para perda máxima e piso).
export type EquityPointDecision = {
  readonly candleOpenTime: number;
  readonly equity: string;
  readonly equityAtLow: string;
  readonly benchmark: string;
};

// Trilha do comando aplicado no fechamento do candle (idempotência e auditoria pelo `commandId`).
export type AppliedCommandDecision = {
  readonly commandId: string;
  readonly candleOpenTime: number;
  readonly issuedAt: number;
  readonly kind: CommandKind;
  readonly reason: CommandReason;
};

export type WalletDecisions = {
  readonly commands: readonly AppliedCommandDecision[];
  readonly orders: readonly OrderEvent[];
  readonly fills: readonly FillDecision[];
  readonly openedPositions: readonly OpenedPositionDecision[];
  readonly closedPositions: readonly ClosedPositionDecision[];
  readonly equityPoint: EquityPointDecision | null;
};

export type StepDecisions = WalletDecisions & {
  readonly signal: SignalDecision | null;
};
