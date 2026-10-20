// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SizingConstraint } from '@ativada/strategy-engine';

import type { PriceDistance, TradeResult } from './trade-plan-math.js';
import type {
  TRADE_PLAN_STATUS,
  TEAM_PLAN_STATUS,
  TeamPlanUnavailableReason,
  TradePlanUnavailableReason,
} from './trade-plan.constant.js';

// Tudo texto decimal: preços na grade do tick, dinheiro com os arredondamentos do motor, taxas em fração a 12 casas.
// `distance` é sempre a partir de `currentPrice` (o último fechamento gravado).
export type PricePointView = { readonly price: string; readonly distance: PriceDistance };

// Alvo ou proteção: o preço que dispara, a venda simulada que ele dá, quanto ele fica da entrada e o líquido nessa saída
// (`null` quando o motor não compraria nenhuma quantidade).
export type ProtectiveLevelView = PricePointView & {
  readonly exitPrice: string;
  readonly fromEntryRate: string;
  readonly result: TradeResult | null;
};

export type SizingView = {
  readonly riskAmount: string;
  readonly quantity: string;
  readonly notional: string;
  readonly entryCost: string;
  readonly constraint: SizingConstraint;
};

type DecidedCandle = {
  readonly candleTime: number;
  readonly closedAt: number;
  readonly currentPrice: string;
};

export type AwaitingEntryPlanView = DecidedCandle & {
  readonly status: typeof TRADE_PLAN_STATUS.AWAITING_ENTRY;
  readonly orderType: 'market' | 'limit';
  // A abertura estimada da próxima vela (o último fechamento no tick, para cima); `null` na ordem limitada.
  readonly nextOpenEstimate: string | null;
  readonly entry: PricePointView;
  readonly target: ProtectiveLevelView;
  readonly stop: ProtectiveLevelView;
  readonly sizing: SizingView;
  readonly message: string;
};

export type HoldingPlanView = DecidedCandle & {
  readonly status: typeof TRADE_PLAN_STATUS.HOLDING;
  readonly entryPrice: string;
  readonly quantity: string;
  readonly entryCost: string;
  readonly openedCandleTime: number;
  // Vender agora: a venda simulada a mercado sobre o último fechamento e o líquido que ela daria.
  readonly exit: PricePointView & { readonly result: TradeResult };
  readonly target: ProtectiveLevelView;
  readonly stop: ProtectiveLevelView;
  readonly message: string;
};

export type UnavailablePlanView = {
  readonly status: typeof TRADE_PLAN_STATUS.UNAVAILABLE;
  readonly reason: TradePlanUnavailableReason;
  readonly message: string;
};

export type RunTradePlanView = AwaitingEntryPlanView | HoldingPlanView | UnavailablePlanView;

// A carteira da própria equipe (só na execução de equipe dela): saldo, resultado e taxa desde o início.
export type TeamWalletView = {
  readonly current: string;
  readonly result: string;
  readonly resultRate: string;
};

type TeamHead = {
  readonly teamKey: string;
  readonly displayName: string;
  readonly wallet: TeamWalletView | null;
};

export type AvailableTeamPlanView = TeamHead & {
  readonly status: typeof TEAM_PLAN_STATUS.AVAILABLE;
  readonly reportId: string;
  readonly candleTime: number;
  readonly confidence: number | null;
  readonly entry: PricePointView & { readonly suggestedPrice: string };
  readonly target: ProtectiveLevelView;
  readonly stop: ProtectiveLevelView;
  readonly sizing: SizingView;
  readonly message: string;
};

export type UnavailableTeamPlanView = TeamHead & {
  readonly status: typeof TEAM_PLAN_STATUS.UNAVAILABLE;
  readonly reason: TeamPlanUnavailableReason;
  readonly reportId: string | null;
  readonly candleTime: number | null;
  readonly action: 'buy' | 'sell' | 'hold' | null;
  readonly confidence: number | null;
  readonly message: string;
};

export type TeamPlanView = AvailableTeamPlanView | UnavailableTeamPlanView;

export type TradePlanView = {
  readonly version: string;
  readonly runId: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly notice: string;
  readonly plan: RunTradePlanView;
  readonly teams: readonly TeamPlanView[];
};
