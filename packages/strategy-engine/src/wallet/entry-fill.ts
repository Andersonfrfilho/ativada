// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  formatEngineDecimal,
  toEngineDecimal,
  type EngineDecimalValue,
} from '../engine-decimal.js';
import type { PendingOrderState } from '../engine-state.types.js';
import {
  ORDER_EVENT_REASON,
  ORDER_SIDE,
  ORDER_STATUS,
  type OrderEventReason,
} from '../engine-vocabulary.constant.js';
import { computePositionSize } from '../risk/position-size.js';
import { computeProtectivePrices } from '../risk/protective-prices.js';
import { SIZING_CONSTRAINT } from '../risk/risk.constant.js';
import { recordOrder, requireText, takeKey } from './wallet-orders.js';
import { buyDebit, tradeFee } from './wallet-pricing.js';
import type { WalletContext, WalletDraft } from './wallet.types.js';

export type EntryFill = {
  readonly order: PendingOrderState;
  readonly price: EngineDecimalValue;
};

type ProtectiveLevels = { readonly stopPrice: string; readonly targetPrice: string };

type PricedEntry = ProtectiveLevels & {
  readonly kind: 'priced';
  readonly quantity: string;
  readonly isVolumeCapped: boolean;
};

type RejectedEntry = { readonly kind: 'rejected'; readonly reason: OrderEventReason };

type Opening = { readonly fill: EntryFill; readonly priced: PricedEntry };
type ProtectedEntry = { readonly fill: EntryFill; readonly levels: ProtectiveLevels };

function reject(reason: OrderEventReason): RejectedEntry {
  return { kind: 'rejected', reason };
}

// A ordem guarda as distâncias (ATR de `t` × múltiplos); o ATR de `t` volta delas, exato: a divisão do
// produto pelo múltiplo termina em até 15 algarismos, bem dentro da precisão do `EngineDecimal`.
function recoverDecisionAtr(order: PendingOrderState, context: WalletContext): string {
  const stopDistance = toEngineDecimal(requireText(order.stopDistance, 'distância do stop'));
  const multiple = toEngineDecimal(context.config.risk.stopAtrMultiple);
  return formatEngineDecimal(stopDistance.dividedBy(multiple));
}

// Stop e alvo nascem do preço de PREENCHIMENTO com o ATR do candle de DECISÃO (nunca do futuro).
function priceProtection(
  fill: EntryFill,
  context: WalletContext,
): ProtectiveLevels | RejectedEntry {
  const { parameters, config } = context;
  const protective = computeProtectivePrices({
    entryPrice: formatEngineDecimal(fill.price),
    atr: recoverDecisionAtr(fill.order, context),
    stopAtrMultiple: config.risk.stopAtrMultiple,
    targetAtrMultiple: config.risk.targetAtrMultiple,
    slippageRate: parameters.slippageRate,
    tickSize: parameters.tickSize,
  });
  if (protective.kind === 'priced') {
    return { stopPrice: protective.stopPrice, targetPrice: protective.targetPrice };
  }
  const isZeroAtr = protective.reason === ORDER_EVENT_REASON.ZERO_ATR;
  return reject(isZeroAtr ? ORDER_EVENT_REASON.ZERO_ATR : ORDER_EVENT_REASON.INVALID_STOP);
}

// A quantidade nasce do valor em risco guardado e do volume do candle de decisão (`decisionVolume`).
function sizeEntry(
  draft: WalletDraft,
  context: WalletContext,
  entry: ProtectedEntry,
): PricedEntry | RejectedEntry {
  const { fill, levels } = entry;
  const { parameters, config } = context;
  const size = computePositionSize({
    riskAmount: requireText(fill.order.riskAmount, 'valor em risco'),
    entryPrice: formatEngineDecimal(fill.price),
    stopPrice: levels.stopPrice,
    feeRate: parameters.feeRate,
    slippageRate: parameters.slippageRate,
    cash: draft.state.cash,
    equity: draft.state.cash,
    maxExposureRate: config.risk.maxExposureRate,
    candleVolume: requireText(fill.order.decisionVolume, 'volume de decisão'),
    maxVolumeShare: parameters.maxVolumeShare,
    quantityStep: parameters.quantityStep,
    tickSize: parameters.tickSize,
    minNotional: parameters.minNotional,
  });
  if (size.constraint === SIZING_CONSTRAINT.INVALID_STOP) {
    return reject(ORDER_EVENT_REASON.INVALID_STOP);
  }
  if (size.quantity === '0') return reject(ORDER_EVENT_REASON.BELOW_MIN_NOTIONAL);
  return {
    kind: 'priced',
    quantity: size.quantity,
    stopPrice: levels.stopPrice,
    targetPrice: levels.targetPrice,
    isVolumeCapped: size.constraint === SIZING_CONSTRAINT.VOLUME_CAPPED,
  };
}

function openState(draft: WalletDraft, opening: Opening, context: WalletContext): void {
  const { fill, priced } = opening;
  const notional = toEngineDecimal(priced.quantity).times(fill.price);
  const position = {
    positionKey: takeKey(draft, 'position'),
    openedCandleOpenTime: context.candle.openTime,
    entryPrice: formatEngineDecimal(fill.price),
    quantity: priced.quantity,
    stopPrice: priced.stopPrice,
    targetPrice: priced.targetPrice,
    entryFee: formatEngineDecimal(tradeFee(notional, context.parameters)),
  };
  const cash = toEngineDecimal(draft.state.cash).minus(buyDebit(notional, context.parameters));
  draft.state = { ...draft.state, cash: formatEngineDecimal(cash), position };
}

function recordOpening(draft: WalletDraft, opening: Opening, context: WalletContext): void {
  const { fill, priced } = opening;
  const position = draft.state.position;
  if (position === null) return;
  const notional = toEngineDecimal(position.quantity).times(position.entryPrice);
  recordOrder(draft, context, {
    order: fill.order,
    status: ORDER_STATUS.FILLED,
    price: position.entryPrice,
    quantity: position.quantity,
    reason: priced.isVolumeCapped ? ORDER_EVENT_REASON.VOLUME_CAPPED : null,
  });
  draft.fills.push({
    orderKey: fill.order.orderKey,
    positionKey: position.positionKey,
    candleOpenTime: context.candle.openTime,
    side: ORDER_SIDE.BUY,
    price: position.entryPrice,
    quantity: position.quantity,
    notional: formatEngineDecimal(notional),
    fee: position.entryFee,
  });
  draft.openedPositions.push({
    positionKey: position.positionKey,
    candleOpenTime: context.candle.openTime,
    entryPrice: position.entryPrice,
    quantity: position.quantity,
    stopPrice: position.stopPrice,
    targetPrice: position.targetPrice,
    entryFee: position.entryFee,
  });
}

// Preenchimento da entrada ao preço `fill.price`: abre a posição ou recusa a ordem com o motivo.
export function openPosition(draft: WalletDraft, fill: EntryFill, context: WalletContext): void {
  const levels = priceProtection(fill, context);
  const priced = 'reason' in levels ? levels : sizeEntry(draft, context, { fill, levels });
  if (priced.kind === 'rejected') {
    recordOrder(draft, context, {
      order: fill.order,
      status: ORDER_STATUS.REJECTED,
      reason: priced.reason,
    });
    return;
  }
  openState(draft, { fill, priced }, context);
  recordOpening(draft, { fill, priced }, context);
}
