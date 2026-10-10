// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SignalDecision } from '../engine-decision.types.js';
import type { PendingOrderState } from '../engine-state.types.js';
import type { EngineCommand } from '../engine.types.js';
import {
  COMMAND_KIND,
  ENTRY_ORDER_TYPE,
  EXIT_REASON,
  ORDER_EVENT_REASON,
  ORDER_PURPOSE,
  ORDER_SIDE,
  ORDER_STATUS,
  SIGNAL_ACTION,
  type ExitReason,
  type OrderEventReason,
} from '../engine-vocabulary.constant.js';
import { placeEntry } from './entry-order.js';
import { recordOrder, takeKey } from './wallet-orders.js';
import type { WalletContext, WalletDraft } from './wallet.types.js';

export type ClosingInputs = {
  readonly signal: SignalDecision | null;
  readonly commands: readonly EngineCommand[];
};

function cancelPendingEntry(
  draft: WalletDraft,
  context: WalletContext,
  reason: OrderEventReason,
): void {
  const order = draft.state.pendingOrder;
  if (order?.purpose !== ORDER_PURPOSE.ENTRY) return;
  draft.state = { ...draft.state, pendingOrder: null };
  recordOrder(draft, context, { order, status: ORDER_STATUS.CANCELLED, reason });
}

// Venda a mercado para `t+1`; só com posição aberta e nenhuma outra ordem viva.
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
    filledQuantity: '0',
    exitReason,
  };
  recordOrder(draft, context, { order, status: ORDER_STATUS.CREATED });
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

// Tabela de sinais do ADR 0002 §e: BUY só entra com a carteira livre; SELL cancela a entrada viva ou
// vende a posição; HOLD não faz nada. No máximo uma ordem nova por fechamento.
export function applyClose(
  draft: WalletDraft,
  context: WalletContext,
  closing: ClosingInputs,
): void {
  for (const command of closing.commands) applyCommand(draft, context, command);
  const { signal } = closing;
  if (signal === null) return;
  if (signal.action === SIGNAL_ACTION.BUY) return placeEntry(draft, context, signal);
  if (signal.action !== SIGNAL_ACTION.SELL) return;
  cancelPendingEntry(draft, context, ORDER_EVENT_REASON.OPPOSITE_SIGNAL);
  createExit(draft, context, EXIT_REASON.SIGNAL);
}
