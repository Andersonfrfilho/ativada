// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { FillModel, FillModelInput, FillModelResult } from '../engine.types.js';
import { ENGINE_INPUT_ERROR_CODE, EngineInputError } from '../strategy-engine.error.js';
import { ORDER_SIDE, ENTRY_ORDER_TYPE } from '../engine-vocabulary.constant.js';
import { executePendingExit } from './exit-fill.js';
import { executeLimitOrder } from './limit-fill.js';
import { openPosition } from './entry-fill.js';
import { evaluateProtectiveExits } from './protective-exit.js';
import { marketBuyPrice } from './wallet-pricing.js';
import { createWalletDraft, type WalletContext, type WalletDraft } from './wallet.types.js';

// Ordem pendente decidida no fechamento anterior: mercado na abertura, limitada se o candle cruzar.
export function executePendingOrder(draft: WalletDraft, context: WalletContext): void {
  const order = draft.state.pendingOrder;
  if (order === null) return;
  if (order.side === ORDER_SIDE.SELL) return executePendingExit(draft, order, context);
  if (order.type === ENTRY_ORDER_TYPE.MARKET) {
    draft.state = { ...draft.state, pendingOrder: null };
    const price = marketBuyPrice(context.candle.open, context.parameters);
    return openPosition(draft, { order, price }, context);
  }
  executeLimitOrder(draft, order, context);
}

export function assertNoExecutionReports(reports: readonly unknown[] | undefined): void {
  if ((reports?.length ?? 0) === 0) return;
  throw new EngineInputError({
    code: ENGINE_INPUT_ERROR_CODE.EXECUTION_REPORTS_UNSUPPORTED,
    message: 'O motor só simula: relatórios da corretora são da spec 002.',
  });
}

function buildWalletContext(input: FillModelInput): WalletContext {
  return {
    config: input.strategy.config,
    parameters: input.run.parameters,
    candle: input.candle,
  };
}

// Passos 1 e 2 do candle (ADR 0002 §e): a ordem pendente na abertura, depois stop e alvo da posição
// (inclusive a que acabou de abrir) contra máxima e mínima.
export function applyFillModel(draft: WalletDraft, context: WalletContext): void {
  executePendingOrder(draft, context);
  evaluateProtectiveExits(draft, context);
}

// O `FillModel` simulado: preenche pelo OHLC; a versão real (spec 002) aplica os relatórios da corretora.
export const simulatedFillModel: FillModel = (input: FillModelInput): FillModelResult => {
  assertNoExecutionReports(input.executionReports);
  const draft = createWalletDraft(input.state);
  applyFillModel(draft, buildWalletContext(input));
  return {
    state: draft.state,
    orders: draft.orders,
    fills: draft.fills,
    openedPositions: draft.openedPositions,
    closedPositions: draft.closedPositions,
  };
};
