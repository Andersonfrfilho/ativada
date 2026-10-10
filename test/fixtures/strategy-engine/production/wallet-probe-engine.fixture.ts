// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  assertStepInput,
  createInitialEngineState,
  walletStep,
  type Engine,
  type EngineState,
  type StepInput,
  type StepResult,
} from '../../../../packages/strategy-engine/src/index.js';
import { REFERENCE_ENGINE_DEFECT } from '../reference-engine-defect.fixture.js';
import { referenceLeadInCandles, runReferenceSignalStep } from '../reference-signal.fixture.js';

export const WALLET_PROBE_ENGINE_VERSION = 'wallet-probe-1';

function probeStep(input: StepInput): StepResult {
  assertStepInput({ input, engineVersion: WALLET_PROBE_ENGINE_VERSION });
  const signal = runReferenceSignalStep(
    {
      strategy: input.strategy,
      market: input.run.parameters,
      state: input.state.signal,
      candle: input.candle,
      sentiment: input.sentiment,
      confirmedGapCandles: input.confirmedGapCandles,
    },
    REFERENCE_ENGINE_DEFECT.NONE,
    0,
  );
  const wallet = walletStep({
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

// O `walletStep` de PRODUÇÃO ligado ao sinal da REFERÊNCIA: os cenários do harness foram escritos para o
// sinal "sempre comprado" e só ele os faz acontecer; aqui o que está sob prova é a carteira.
export function createWalletProbeEngine(): Engine {
  return {
    engineVersion: WALLET_PROBE_ENGINE_VERSION,
    createInitialState: ({ strategy, run }): EngineState =>
      createInitialEngineState({
        strategy,
        run,
        engineVersion: WALLET_PROBE_ENGINE_VERSION,
        leadInCandles: referenceLeadInCandles(strategy.config),
      }),
    step: probeStep,
    signalStep: (input) => runReferenceSignalStep(input, REFERENCE_ENGINE_DEFECT.NONE, 0),
    walletStep,
  };
}
