// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  assertStepInput,
  computeStrategyLeadInCandles,
  createInitialEngineState,
  signalStep,
  type Engine,
  type StepInput,
  type StepResult,
} from '../../../../packages/strategy-engine/src/index.js';
import { REFERENCE_ENGINE_DEFECT } from '../reference-engine-defect.fixture.js';
import { runReferenceWalletStep } from '../reference-wallet.fixture.js';

export const COMPOSED_ENGINE_VERSION = 'signal-probe-1';

function composeStep(input: StepInput): StepResult {
  assertStepInput({ input, engineVersion: COMPOSED_ENGINE_VERSION });
  const signal = signalStep({
    strategy: input.strategy,
    market: input.run.parameters,
    state: input.state.signal,
    candle: input.candle,
    sentiment: input.sentiment,
    confirmedGapCandles: input.confirmedGapCandles,
  });
  const wallet = runReferenceWalletStep(
    {
      strategy: input.strategy,
      run: input.run,
      state: input.state.wallet,
      candle: input.candle,
      signal: signal.signal,
      commands: input.commands,
      executionReports: input.executionReports,
    },
    REFERENCE_ENGINE_DEFECT.NONE,
  );
  return {
    state: { ...input.state, signal: signal.state, wallet: wallet.state },
    decisions: { signal: signal.signal, ...wallet.decisions },
  };
}

// O `signalStep` de PRODUÇÃO ligado ao `step` composto, com a carteira da referência (a de produção é
// a T2.5): prova que o sinal novo encaixa no contrato do passo inteiro.
export function createProductionSignalProbeEngine(): Engine {
  return {
    engineVersion: COMPOSED_ENGINE_VERSION,
    createInitialState: ({ strategy, run }) =>
      createInitialEngineState({
        strategy,
        run,
        engineVersion: COMPOSED_ENGINE_VERSION,
        leadInCandles: computeStrategyLeadInCandles(strategy.config),
      }),
    step: composeStep,
    signalStep,
    walletStep: (input) => runReferenceWalletStep(input, REFERENCE_ENGINE_DEFECT.NONE),
  };
}
