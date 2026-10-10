// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { WalletStepInput, WalletStepResult } from '../engine.types.js';
import { applyFillModel, assertNoExecutionReports } from './fill-model.js';
import { applyClose } from './signal-policy.js';
import { assertStandaloneWalletInput } from './wallet-guard.js';
import { buildEquityPoint, buyBenchmark } from './wallet-valuation.js';
import { createWalletDraft, type WalletContext } from './wallet.types.js';

// A metade CARTEIRA do passo, sem guardas: o `step` composto já conferiu a entrada inteira. Sequência
// (ADR 0002 §e): pendentes na abertura → stop e alvo → régua → comandos e decisão do sinal de `t` (no
// máximo uma ordem nova) → ponto de patrimônio.
export function runWalletStep(input: WalletStepInput): WalletStepResult {
  assertNoExecutionReports(input.executionReports);
  const { candle } = input;
  const context: WalletContext = {
    config: input.strategy.config,
    parameters: input.run.parameters,
    candle,
  };
  const draft = createWalletDraft(input.state);
  applyFillModel(draft, context);
  buyBenchmark(draft, context);
  if (input.signal !== null && draft.state.firstSignalCandleOpenTime === null) {
    draft.state = { ...draft.state, firstSignalCandleOpenTime: candle.openTime };
  }
  applyClose(draft, context, { signal: input.signal, commands: input.commands ?? [] });
  const equityPoint = input.signal === null ? null : buildEquityPoint(draft, context);
  const { commands, orders, fills, openedPositions, closedPositions } = draft;
  return {
    state: { ...draft.state, lastCandleOpenTime: candle.openTime },
    decisions: { commands, orders, fills, openedPositions, closedPositions, equityPoint },
  };
}

// A carteira avulsa (walk-forward, metas): confere forma do candle, ordem, hashes e contiguidade antes.
export function walletStep(input: WalletStepInput): WalletStepResult {
  assertStandaloneWalletInput(input);
  return runWalletStep(input);
}
