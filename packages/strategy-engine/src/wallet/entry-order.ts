// Copyright (c) 2026 Ada Technology. All rights reserved.
import { decimalFromIndicator, formatEngineDecimal, toEngineDecimal } from '../engine-decimal.js';
import { EngineDecimal } from '../engine-decimal.js';
import { RISK_ATR_INDICATOR_ID } from '../engine.constant.js';
import type { SignalDecision } from '../engine-decision.types.js';
import type { PendingOrderState } from '../engine-state.types.js';
import {
  ENTRY_ORDER_TYPE,
  ORDER_EVENT_REASON,
  ORDER_PURPOSE,
  ORDER_SIDE,
  ORDER_STATUS,
  type OrderEventReason,
} from '../engine-vocabulary.constant.js';
import { moneyDown } from '../money.js';
import { recordOrder, takeKey } from './wallet-orders.js';
import { tickDown } from './wallet-pricing.js';
import type { WalletContext, WalletDraft } from './wallet.types.js';

const NO_FILL = '0';

function emptyEntry(draft: WalletDraft, context: WalletContext): PendingOrderState {
  const isLimit = context.config.entry.orderType === ENTRY_ORDER_TYPE.LIMIT;
  return {
    orderKey: takeKey(draft, 'order'),
    side: ORDER_SIDE.BUY,
    type: isLimit ? ENTRY_ORDER_TYPE.LIMIT : ENTRY_ORDER_TYPE.MARKET,
    purpose: ORDER_PURPOSE.ENTRY,
    createdCandleOpenTime: context.candle.openTime,
    limitPrice: null,
    riskAmount: null,
    stopDistance: null,
    targetDistance: null,
    eligibleCandles: null,
    decisionVolume: null,
    filledQuantity: NO_FILL,
    exitReason: null,
  };
}

function rejectEntry(draft: WalletDraft, context: WalletContext, reason: OrderEventReason): void {
  const order = emptyEntry(draft, context);
  recordOrder(draft, context, { order, status: ORDER_STATUS.REJECTED, reason });
}

function riskAmountOf(draft: WalletDraft, context: WalletContext): string {
  const budget = toEngineDecimal(draft.state.cash).times(context.config.risk.riskPerTrade);
  return formatEngineDecimal(moneyDown(budget));
}

// A entrada guarda o VALOR EM RISCO (saldo × riskPerTrade) e as distâncias pelo ATR de `t`; a
// quantidade nasce no preenchimento, com o preço de `t+1` (ADR 0002 §e).
function buildEntryOrder(
  draft: WalletDraft,
  context: WalletContext,
  atr: number,
): PendingOrderState {
  const { config, candle } = context;
  const atrValue = decimalFromIndicator(atr);
  const sized = {
    ...emptyEntry(draft, context),
    riskAmount: riskAmountOf(draft, context),
    stopDistance: formatEngineDecimal(atrValue.times(config.risk.stopAtrMultiple)),
    targetDistance: formatEngineDecimal(atrValue.times(config.risk.targetAtrMultiple)),
    decisionVolume: formatEngineDecimal(toEngineDecimal(candle.volume)),
  };
  if (config.entry.orderType !== ENTRY_ORDER_TYPE.LIMIT) return sized;
  const offset = new EngineDecimal(1).minus(config.entry.offsetRate);
  const limitPrice = tickDown(toEngineDecimal(candle.close).times(offset), context.parameters);
  return {
    ...sized,
    limitPrice: formatEngineDecimal(limitPrice),
    eligibleCandles: config.entry.expiryCandles,
  };
}

// BUY: só entra livre (sem posição, sem pendente, sem `halt`); ATR ausente ou zero e risco zero recusam.
export function placeEntry(
  draft: WalletDraft,
  context: WalletContext,
  signal: SignalDecision,
): void {
  const { state } = draft;
  if (state.isHalted || state.pendingOrder !== null || state.position !== null) return;
  const atr = signal.indicators[RISK_ATR_INDICATOR_ID] ?? null;
  if (atr === null || atr <= 0) return rejectEntry(draft, context, ORDER_EVENT_REASON.ZERO_ATR);
  if (toEngineDecimal(riskAmountOf(draft, context)).lte(0)) {
    return rejectEntry(draft, context, ORDER_EVENT_REASON.BELOW_MIN_NOTIONAL);
  }
  const order = buildEntryOrder(draft, context, atr);
  recordOrder(draft, context, { order, status: ORDER_STATUS.CREATED });
  draft.state = { ...draft.state, pendingOrder: order };
}
