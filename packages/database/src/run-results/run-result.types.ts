// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonContainer } from '../json-value.types.js';
import type { OwnerScope } from '../ownership/owner-scope.js';
import type {
  CommandKind,
  CommandReason,
  CommandStatus,
  ExitReason,
  OrderPurpose,
  OrderReason,
  OrderSide,
  OrderStatus,
  OrderType,
  PositionStatus,
  Regime,
  SignalAction,
} from './run-result.constant.js';

// Decimais (preço, quantidade, patrimônio, pontuação) são texto canônico, como o motor os emite.
export type SignalInput = {
  readonly candleTime: number;
  readonly action: SignalAction;
  readonly score: string;
  readonly regime: Regime;
  readonly votes: JsonContainer;
  readonly indicators: JsonContainer;
  readonly sentimentObservation: JsonContainer | undefined;
  readonly reason: string;
};

export type OrderInput = {
  readonly engineKey: string;
  readonly side: OrderSide;
  readonly type: OrderType;
  readonly purpose: OrderPurpose;
  readonly status: OrderStatus;
  readonly reason: OrderReason | undefined;
  readonly quantity: string | undefined;
  readonly price: string | undefined;
  readonly limitPrice: string | undefined;
  readonly triggerPrice: string | undefined;
  readonly riskAmount: string | undefined;
  readonly stopDistance: string | undefined;
  readonly targetDistance: string | undefined;
  readonly eligibleCandles: number | undefined;
  readonly createdCandleTime: number;
  readonly expiresCandleTime: number | undefined;
  readonly lastEventCandleTime: number;
};

export type FillInput = {
  readonly orderKey: string;
  readonly positionKey: string;
  readonly candleTime: number;
  readonly side: OrderSide;
  readonly price: string;
  readonly quantity: string;
  readonly notional: string;
  readonly fee: string;
};

export type PositionInput = {
  readonly engineKey: string;
  readonly status: PositionStatus;
  readonly entryPrice: string;
  readonly quantity: string;
  readonly stopPrice: string;
  readonly targetPrice: string;
  readonly entryFee: string;
  readonly exitPrice: string | undefined;
  readonly exitFee: string | undefined;
  readonly netProfit: string | undefined;
  readonly exitReason: ExitReason | undefined;
  readonly openedCandleTime: number;
  readonly closedCandleTime: number | undefined;
};

export type EquityPointInput = {
  readonly candleTime: number;
  readonly equity: string;
  readonly equityAtLow: string;
  readonly benchmark: string;
};

export type CommandInput = {
  readonly commandId: string;
  readonly kind: CommandKind;
  readonly reason: CommandReason;
  readonly issuedAt: number;
  readonly candleTime: number;
  readonly status: CommandStatus;
};

// `written` conta linhas inseridas ou avançadas; o reenvio idêntico devolve 0.
export type AppendResult = { readonly written: number };

export type ListResultsParams<TCursor> = {
  readonly limit: number;
  readonly after: TCursor | undefined;
};

export type ResultPage<TItem, TCursor> = {
  readonly items: readonly TItem[];
  readonly nextCursor: TCursor | undefined;
};

export type OrderCursor = { readonly createdCandleTime: number; readonly engineKey: string };
export type FillCursor = { readonly candleTime: number; readonly orderKey: string };
export type PositionCursor = { readonly openedCandleTime: number; readonly engineKey: string };

type AppendOf<TInput> = (
  scope: OwnerScope,
  runId: string,
  rows: readonly TInput[],
) => Promise<AppendResult | undefined>;

type ListOf<TItem, TCursor> = (
  scope: OwnerScope,
  runId: string,
  params: ListResultsParams<TCursor>,
) => Promise<ResultPage<TItem, TCursor> | undefined>;

// `undefined` quer dizer "execução não encontrada para este dono", igual a uma execução inexistente.
export type RunResultRepository = {
  readonly appendSignals: AppendOf<SignalInput>;
  readonly appendOrders: AppendOf<OrderInput>;
  readonly appendFills: AppendOf<FillInput>;
  readonly appendPositions: AppendOf<PositionInput>;
  readonly appendEquityPoints: AppendOf<EquityPointInput>;
  readonly appendCommands: AppendOf<CommandInput>;
  readonly listSignals: ListOf<SignalInput, number>;
  readonly listOrders: ListOf<OrderInput, OrderCursor>;
  readonly listFills: ListOf<FillInput, FillCursor>;
  readonly listPositions: ListOf<PositionInput, PositionCursor>;
  readonly listEquityPoints: ListOf<EquityPointInput, number>;
};
