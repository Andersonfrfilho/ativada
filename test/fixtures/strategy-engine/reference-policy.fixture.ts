// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  COMMAND_KIND,
  decimalFromIndicator,
  EngineDecimal,
  ENTRY_ORDER_TYPE,
  EXIT_REASON,
  ORDER_EVENT_REASON,
  ORDER_PURPOSE,
  ORDER_SIDE,
  ORDER_STATUS,
  RISK_ATR_INDICATOR_ID,
  SIGNAL_ACTION,
  type EngineCommand,
  type ExitReason,
  type OrderEventReason,
  type PendingOrderState,
  type SignalDecision,
} from '../../../packages/strategy-engine/src/index.js';
import { REFERENCE_ENGINE_DEFECT } from './reference-engine-defect.fixture.js';
import { entryMarketPrice, openPosition } from './reference-fills.fixture.js';
import {
  orderEvent,
  takeKey,
  type WalletContext,
  type WalletDraft,
} from './reference-orders.fixture.js';
import {
  formatEngineDecimal,
  moneyDown,
  tickDown,
  toEngineDecimal,
} from './reference-pricing.fixture.js';

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
  draft.orders.push(orderEvent({ order, context, status: ORDER_STATUS.REJECTED, reason }));
}

// A entrada guarda o VALOR EM RISCO (saldo × riskPerTrade) e as distâncias pelo ATR de `t`; a
// quantidade nasce no preenchimento, com o preço de `t+1`.
function buildEntryOrder(
  draft: WalletDraft,
  context: WalletContext,
  atr: number,
): PendingOrderState {
  const { config, candle, defect } = context;
  const atrValue = decimalFromIndicator(atr);
  const order = emptyEntry(draft, context);
  const riskAmount = moneyDown(toEngineDecimal(draft.state.cash).times(config.risk.riskPerTrade));
  const isStashingClose =
    defect === REFERENCE_ENGINE_DEFECT.SIZE_AT_DECISION ||
    defect === REFERENCE_ENGINE_DEFECT.STOP_FROM_DECISION_CLOSE;
  const sized = {
    ...order,
    riskAmount: formatEngineDecimal(riskAmount),
    stopDistance: formatEngineDecimal(atrValue.times(config.risk.stopAtrMultiple)),
    targetDistance: formatEngineDecimal(atrValue.times(config.risk.targetAtrMultiple)),
    decisionVolume: formatEngineDecimal(toEngineDecimal(candle.volume)),
    filledQuantity: isStashingClose ? candle.close : NO_FILL,
  };
  if (config.entry.orderType !== ENTRY_ORDER_TYPE.LIMIT) return sized;
  const offset = new EngineDecimal(1).minus(config.entry.offsetRate);
  const limitPrice = tickDown(toEngineDecimal(candle.close).times(offset), context.run);
  return {
    ...sized,
    limitPrice: formatEngineDecimal(limitPrice),
    eligibleCandles: config.entry.expiryCandles,
  };
}

function placeEntry(draft: WalletDraft, context: WalletContext, signal: SignalDecision): void {
  const { state } = draft;
  if (state.isHalted || state.pendingOrder !== null) return;
  if (state.position !== null) {
    if (context.defect !== REFERENCE_ENGINE_DEFECT.ALLOWS_SECOND_POSITION) return;
    const order = emptyEntry(draft, context);
    draft.orders.push(orderEvent({ order, context, status: ORDER_STATUS.CREATED }));
    return;
  }
  const atr = signal.indicators[RISK_ATR_INDICATOR_ID] ?? null;
  if (atr === null || atr <= 0) return rejectEntry(draft, context, ORDER_EVENT_REASON.ZERO_ATR);
  if (moneyDown(toEngineDecimal(state.cash).times(context.config.risk.riskPerTrade)).lte(0)) {
    return rejectEntry(draft, context, ORDER_EVENT_REASON.BELOW_MIN_NOTIONAL);
  }
  const order = buildEntryOrder(draft, context, atr);
  draft.orders.push(orderEvent({ order, context, status: ORDER_STATUS.CREATED }));
  const isFillingAtClose =
    context.defect === REFERENCE_ENGINE_DEFECT.FILLS_AT_DECISION_CLOSE &&
    order.type === ENTRY_ORDER_TYPE.MARKET;
  if (isFillingAtClose) {
    return openPosition(
      draft,
      { order, price: entryMarketPrice(context, context.candle.close) },
      context,
    );
  }
  draft.state = { ...draft.state, pendingOrder: order };
}

function cancelPendingEntry(
  draft: WalletDraft,
  context: WalletContext,
  reason: OrderEventReason,
): void {
  const order = draft.state.pendingOrder;
  if (order?.purpose !== ORDER_PURPOSE.ENTRY) return;
  draft.state = { ...draft.state, pendingOrder: null };
  draft.orders.push(orderEvent({ order, context, status: ORDER_STATUS.CANCELLED, reason }));
}

function createExit(draft: WalletDraft, context: WalletContext, exitReason: ExitReason): void {
  if (draft.state.position === null || draft.state.pendingOrder !== null) return;
  const order: PendingOrderState = {
    orderKey: takeKey(draft, 'order'),
    side: ORDER_SIDE.SELL,
    type: ENTRY_ORDER_TYPE.MARKET,
    purpose: ORDER_PURPOSE.EXIT,
    createdCandleOpenTime: context.candle.openTime,
    limitPrice: null,
    riskAmount: null,
    stopDistance: null,
    targetDistance: null,
    eligibleCandles: null,
    decisionVolume: null,
    filledQuantity: NO_FILL,
    exitReason,
  };
  draft.orders.push(orderEvent({ order, context, status: ORDER_STATUS.CREATED }));
  draft.state = { ...draft.state, pendingOrder: order };
}

// Comandos agem no fechamento, antes do placar: `halt` cancela a entrada viva e para de entrar;
// `resume` volta a entrar; `exit_position` cancela a entrada viva e vende a mercado em t+1.
function applyCommand(draft: WalletDraft, context: WalletContext, command: EngineCommand): void {
  draft.commands.push({
    commandId: command.commandId,
    candleOpenTime: context.candle.openTime,
    issuedAt: command.issuedAt,
    kind: command.kind,
    reason: command.reason,
  });
  if (command.kind === COMMAND_KIND.RESUME) {
    draft.state = { ...draft.state, isHalted: false };
    return;
  }
  cancelPendingEntry(draft, context, ORDER_EVENT_REASON.COMMAND);
  if (command.kind === COMMAND_KIND.HALT) draft.state = { ...draft.state, isHalted: true };
  else createExit(draft, context, EXIT_REASON.COMMAND);
}

// Tabela de sinais do ADR 0002 §c: SELL cancela a entrada viva ou vende a posição; BUY só entra com a
// carteira zerada e sem pendente; HOLD não faz nada.
export function applyClose(
  draft: WalletDraft,
  context: WalletContext,
  params: { readonly signal: SignalDecision | null; readonly commands: readonly EngineCommand[] },
): void {
  for (const command of params.commands) applyCommand(draft, context, command);
  const { signal } = params;
  if (signal === null) return;
  if (signal.action === SIGNAL_ACTION.BUY) return placeEntry(draft, context, signal);
  if (signal.action !== SIGNAL_ACTION.SELL) return;
  if (context.defect !== REFERENCE_ENGINE_DEFECT.IGNORES_OPPOSITE_SIGNAL) {
    cancelPendingEntry(draft, context, ORDER_EVENT_REASON.OPPOSITE_SIGNAL);
  }
  createExit(draft, context, EXIT_REASON.SIGNAL);
}
