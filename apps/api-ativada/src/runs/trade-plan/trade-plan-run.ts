// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { DecisionRow, PositionInput } from '@ativada/database';
import {
  computeProtectivePrices,
  decimalFromIndicator,
  EngineDecimal,
  ENTRY_ORDER_TYPE,
  formatEngineDecimal,
  PROTECTIVE_REFUSAL,
  RISK_ATR_INDICATOR_ID,
  ROUNDING_DIRECTION,
  toEngineDecimal,
  type EngineDecimalValue,
} from '@ativada/strategy-engine';

import { describeAwaiting, describeHolding, describeUnavailable } from './trade-plan-messages.js';
import {
  distanceFromCurrent,
  sizeEntry,
  stopView,
  targetView,
  type PlanBasis,
} from './trade-plan-levels.js';
import {
  buyCost,
  marketBuyFill,
  marketSellFill,
  resultAt,
  tickDown,
  tickUp,
} from './trade-plan-math.js';
import type {
  AwaitingEntryPlanView,
  HoldingPlanView,
  RunTradePlanView,
  UnavailablePlanView,
} from './trade-plan-view.js';
import {
  TRADE_PLAN_STATUS,
  TRADE_PLAN_UNAVAILABLE_REASON,
  type TradePlanUnavailableReason,
} from './trade-plan.constant.js';

const { UP } = ROUNDING_DIRECTION;
const ONE = new EngineDecimal(1);

export type DecidedCandleParams = {
  readonly basis: PlanBasis;
  readonly row: DecisionRow;
  readonly durationMilliseconds: number;
};

export function unavailablePlan(reason: TradePlanUnavailableReason): UnavailablePlanView {
  return { status: TRADE_PLAN_STATUS.UNAVAILABLE, reason, message: describeUnavailable(reason) };
}

function decidedCandle(params: DecidedCandleParams): {
  readonly candleTime: number;
  readonly closedAt: number;
  readonly currentPrice: string;
} {
  return {
    candleTime: params.row.candleTime,
    closedAt: params.row.candleTime + params.durationMilliseconds,
    currentPrice: formatEngineDecimal(params.basis.currentPrice),
  };
}

// O ATR gravado da vela de decisão, pela mesma porta float→decimal que a ordem do motor usa (`decimalFromIndicator`).
function readDecisionAtr(row: DecisionRow): string | undefined {
  const indicators: unknown = row.indicators;
  if (typeof indicators !== 'object' || indicators === null || Array.isArray(indicators)) {
    return undefined;
  }
  const value: unknown = Object.getOwnPropertyDescriptor(indicators, RISK_ATR_INDICATOR_ID)?.value;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return formatEngineDecimal(decimalFromIndicator(value));
}

// A entrada simulada: a mercado, a abertura estimada (o fechamento, tick para cima) mais o deslizamento; limitada, o preço
// limite inteiro (o motor só preenche nele ou abaixo, então é o pior caso).
function entryFillOf(basis: PlanBasis): {
  readonly price: EngineDecimalValue;
  readonly nextOpen: EngineDecimalValue | null;
} {
  const { entry } = basis.config;
  if (entry.orderType === ENTRY_ORDER_TYPE.LIMIT) {
    const offset = ONE.minus(entry.offsetRate);
    return { price: tickDown(basis.currentPrice.times(offset), basis.parameters), nextOpen: null };
  }
  const nextOpen = tickUp(basis.currentPrice, basis.parameters);
  return { price: marketBuyFill(nextOpen, basis.parameters), nextOpen };
}

// Aguardando a compra: o que aconteceria se a estratégia comprasse na próxima vela, com stop e alvo pelo ATR da vela decidida
// (`computeProtectivePrices`, o mesmo do preenchimento) e a quantidade do motor.
export function buildAwaitingPlan(params: DecidedCandleParams): RunTradePlanView {
  const { basis } = params;
  const atr = readDecisionAtr(params.row);
  if (atr === undefined) return unavailablePlan(TRADE_PLAN_UNAVAILABLE_REASON.NO_ATR);
  const fill = entryFillOf(basis);
  const protective = computeProtectivePrices({
    entryPrice: formatEngineDecimal(fill.price),
    atr,
    stopAtrMultiple: basis.config.risk.stopAtrMultiple,
    targetAtrMultiple: basis.config.risk.targetAtrMultiple,
    slippageRate: basis.parameters.slippageRate,
    tickSize: basis.parameters.tickSize,
  });
  if (protective.kind === 'refused') {
    const isZeroAtr = protective.reason === PROTECTIVE_REFUSAL.ZERO_ATR;
    return unavailablePlan(
      isZeroAtr ? TRADE_PLAN_UNAVAILABLE_REASON.NO_ATR : TRADE_PLAN_UNAVAILABLE_REASON.INVALID_STOP,
    );
  }
  const stop = toEngineDecimal(protective.stopPrice);
  const { sizing, levels } = sizeEntry(basis, { entryPrice: fill.price, stop });
  const view: Omit<AwaitingEntryPlanView, 'message'> = {
    status: TRADE_PLAN_STATUS.AWAITING_ENTRY,
    ...decidedCandle(params),
    orderType: basis.config.entry.orderType,
    nextOpenEstimate: fill.nextOpen === null ? null : formatEngineDecimal(fill.nextOpen),
    entry: {
      price: formatEngineDecimal(fill.price),
      distance: distanceFromCurrent(basis, fill.price, UP),
    },
    target: targetView(levels, toEngineDecimal(protective.targetPrice)),
    stop: stopView(levels, stop),
    sizing,
  };
  return { ...view, message: describeAwaiting(view) };
}

// Comprada: a posição gravada (entrada, quantidade, alvo e stop do motor), vender agora a mercado sobre o último fechamento
// e o líquido em cada saída. O custo da entrada é o débito que o motor tirou do caixa (`buyCost` da entrada gravada).
export function buildHoldingPlan(
  params: DecidedCandleParams & { readonly position: PositionInput },
): HoldingPlanView {
  const { basis, position } = params;
  const quantity = toEngineDecimal(position.quantity);
  const entryPrice = toEngineDecimal(position.entryPrice);
  const entryCost = buyCost({ quantity, price: entryPrice }, basis.parameters);
  const levels = { basis, quantity, entryPrice, entryCost };
  const exitPrice = marketSellFill(basis.currentPrice, basis.parameters);
  const view: Omit<HoldingPlanView, 'message'> = {
    status: TRADE_PLAN_STATUS.HOLDING,
    ...decidedCandle(params),
    entryPrice: formatEngineDecimal(entryPrice),
    quantity: formatEngineDecimal(quantity),
    entryCost: formatEngineDecimal(entryCost),
    openedCandleTime: position.openedCandleTime,
    exit: {
      price: formatEngineDecimal(exitPrice),
      distance: distanceFromCurrent(basis, exitPrice, ROUNDING_DIRECTION.DOWN),
      result: resultAt({ quantity, entryCost, exitPrice }, basis.parameters),
    },
    target: targetView(levels, toEngineDecimal(position.targetPrice)),
    stop: stopView(levels, toEngineDecimal(position.stopPrice)),
  };
  return { ...view, message: describeHolding(view) };
}
