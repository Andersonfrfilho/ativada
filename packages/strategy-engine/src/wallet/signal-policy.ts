// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SignalDecision } from '../engine-decision.types.js';
import type { PendingOrderState } from '../engine-state.types.js';
import type { EngineCommand } from '../engine.types.js';
import {
  COMMAND_KIND,
  COMMAND_OUTCOME,
  ENTRY_ORDER_TYPE,
  EXIT_REASON,
  ORDER_EVENT_REASON,
  ORDER_PURPOSE,
  ORDER_SIDE,
  ORDER_STATUS,
  SIGNAL_ACTION,
  type CommandKind,
  type CommandOutcome,
  type EntryRiskScale,
  type ExitReason,
  type OrderEventReason,
} from '../engine-vocabulary.constant.js';
import { MAX_PROCESSED_COMMAND_IDS } from '../engine.constant.js';
import { placeEntry } from './entry-order.js';
import { recordOrder, takeKey } from './wallet-orders.js';
import type { WalletContext, WalletDraft } from './wallet.types.js';

export type ClosingInputs = {
  readonly signal: SignalDecision | null;
  readonly commands: readonly EngineCommand[];
  // O candle veio depois de uma lacuna confirmada: nenhuma entrada nova nele (ADR 0002 §e).
  readonly isAfterGap: boolean;
  // Teto da entrada nova DESTE passo (A21); nunca vale para a saída nem passa ao passo seguinte.
  readonly entryRiskScale?: EntryRiskScale | undefined;
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

const ENTRY_BLOCKING_COMMANDS: readonly CommandKind[] = [
  COMMAND_KIND.HALT,
  COMMAND_KIND.EXIT_POSITION,
];

function recordCommand(
  draft: WalletDraft,
  context: WalletContext,
  params: { readonly command: EngineCommand; readonly status: CommandOutcome },
): void {
  const { command } = params;
  draft.commands.push({
    commandId: command.commandId,
    candleOpenTime: context.candle.openTime,
    issuedAt: command.issuedAt,
    kind: command.kind,
    reason: command.reason,
    status: params.status,
  });
}

function rememberCommand(draft: WalletDraft, commandId: string): void {
  const remembered = [...draft.state.processedCommandIds, commandId];
  draft.state = {
    ...draft.state,
    processedCommandIds: remembered.slice(-MAX_PROCESSED_COMMAND_IDS),
  };
}

// Comandos agem no fechamento, antes do placar: `halt` cancela a entrada viva e para de entrar;
// `resume` volta a entrar; `exit_position` cancela a entrada viva e vende a mercado em t+1. Um `commandId`
// já processado (nos últimos 64) é ignorado e só fica registrado. Devolve se o comando foi aplicado.
function applyCommand(draft: WalletDraft, context: WalletContext, command: EngineCommand): boolean {
  if (draft.state.processedCommandIds.includes(command.commandId)) {
    recordCommand(draft, context, { command, status: COMMAND_OUTCOME.IGNORED_DUPLICATE });
    return false;
  }
  recordCommand(draft, context, { command, status: COMMAND_OUTCOME.APPLIED });
  rememberCommand(draft, command.commandId);
  if (command.kind === COMMAND_KIND.RESUME) {
    draft.state = { ...draft.state, isHalted: false };
    return true;
  }
  cancelPendingEntry(draft, context, ORDER_EVENT_REASON.COMMAND);
  if (command.kind === COMMAND_KIND.HALT) draft.state = { ...draft.state, isHalted: true };
  else createExit(draft, context, EXIT_REASON.COMMAND);
  return true;
}

// `halt` e `exit_position` aplicados suprimem qualquer entrada nova no candle deles (ADR 0002 §h).
function applyCommands(
  draft: WalletDraft,
  context: WalletContext,
  commands: readonly EngineCommand[],
): boolean {
  let isEntryBlocked = false;
  for (const command of commands) {
    const isApplied = applyCommand(draft, context, command);
    if (isApplied && ENTRY_BLOCKING_COMMANDS.includes(command.kind)) isEntryBlocked = true;
  }
  return isEntryBlocked;
}

// Tabela de sinais do ADR 0002 §e: BUY só entra com a carteira livre; SELL cancela a entrada viva ou
// vende a posição; HOLD não faz nada. No máximo uma ordem nova por fechamento.
export function applyClose(
  draft: WalletDraft,
  context: WalletContext,
  closing: ClosingInputs,
): void {
  const hasBlockingCommand = applyCommands(draft, context, closing.commands);
  const { signal } = closing;
  if (signal === null) return;
  if (signal.action === SIGNAL_ACTION.BUY) {
    const isEntryBlocked = closing.isAfterGap || hasBlockingCommand;
    if (isEntryBlocked) return;
    return placeEntry(draft, context, { signal, entryRiskScale: closing.entryRiskScale });
  }
  if (signal.action !== SIGNAL_ACTION.SELL) return;
  cancelPendingEntry(draft, context, ORDER_EVENT_REASON.OPPOSITE_SIGNAL);
  createExit(draft, context, EXIT_REASON.SIGNAL);
}
