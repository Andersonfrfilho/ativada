// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
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

export type SignalDecision = {
  readonly candleOpenTime: number;
  readonly action: SignalAction;
  readonly score: string;
  readonly regime: Regime;
  readonly votes: readonly SignalVote[];
  readonly indicators: Readonly<Record<string, number | null>>;
  readonly reason: string;
};

// Evento do ciclo de vida da ordem; o chamador grava a ordem por `orderKey` e atualiza o status.
export type OrderEvent = {
  readonly orderKey: string;
  readonly candleOpenTime: number;
  readonly status: OrderStatus;
  readonly side: OrderSide;
  readonly type: OrderType;
  readonly purpose: OrderPurpose;
  readonly createdCandleOpenTime: number;
  readonly limitPrice: string | null;
  readonly quoteBudget: string | null;
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

// Patrimônio a valor de liquidação no fechamento (com slippage e taxa de saída), e a régua.
export type EquityPointDecision = {
  readonly candleOpenTime: number;
  readonly equity: string;
  readonly benchmark: string;
};

export type StepDecisions = {
  readonly signal: SignalDecision | null;
  readonly orders: readonly OrderEvent[];
  readonly fills: readonly FillDecision[];
  readonly openedPositions: readonly OpenedPositionDecision[];
  readonly closedPositions: readonly ClosedPositionDecision[];
  readonly equityPoint: EquityPointDecision | null;
};
