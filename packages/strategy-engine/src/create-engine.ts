// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertStepInput } from './assert-step-input.js';
import { createInitialEngineState } from './engine-state.js';
import { ENGINE_VERSION } from './engine.constant.js';
import type {
  CreateEngine,
  CreateInitialStateParams,
  Engine,
  StepInput,
  StepResult,
} from './engine.types.js';
import { signalStep } from './signal-step.js';
import { computeStrategyLeadInCandles } from './strategy-horizons.js';
import { assertNoExecutionReports } from './wallet/fill-model.js';
import { runWalletStep, walletStep } from './wallet/wallet-step.js';

function createInitialState(
  params: CreateInitialStateParams,
): ReturnType<Engine['createInitialState']> {
  return createInitialEngineState({
    strategy: params.strategy,
    run: params.run,
    engineVersion: ENGINE_VERSION,
    leadInCandles: computeStrategyLeadInCandles(params.strategy.config),
  });
}

// `step` ≡ `walletStep ∘ signalStep`: a guarda confere a entrada inteira uma vez e as duas metades rodam
// em seguida; o sinal de `t` alimenta a carteira no mesmo passo. Nada de relógio, sorteio ou I/O.
function step(input: StepInput): StepResult {
  assertStepInput({ input, engineVersion: ENGINE_VERSION });
  assertNoExecutionReports(input.executionReports);
  const signal = signalStep({
    strategy: input.strategy,
    market: input.run.parameters,
    state: input.state.signal,
    candle: input.candle,
    sentiment: input.sentiment,
    confirmedGapCandles: input.confirmedGapCandles,
  });
  const wallet = runWalletStep({
    strategy: input.strategy,
    run: input.run,
    state: input.state.wallet,
    candle: input.candle,
    signal: signal.signal,
    commands: input.commands,
    executionReports: input.executionReports,
  });
  return {
    state: { ...input.state, signal: signal.state, wallet: wallet.state },
    decisions: { signal: signal.signal, ...wallet.decisions },
  };
}

// O motor completo de produção: o mesmo `step` serve ao backtest, ao ao vivo e (com relatórios) à execução real.
export const createEngine: CreateEngine = (): Engine => ({
  engineVersion: ENGINE_VERSION,
  createInitialState,
  step,
  signalStep,
  walletStep,
});
