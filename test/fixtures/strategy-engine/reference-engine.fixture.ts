// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  assertStepInput,
  createInitialEngineState,
  type Engine,
  type EngineState,
  type SignalDecision,
  type SignalStepResult,
  type StepInput,
  type StepResult,
  type WalletStepResult,
} from '../../../packages/strategy-engine/src/index.js';
import {
  guardInput,
  REFERENCE_ENGINE_DEFECT,
  type ReferenceEngineDefect,
} from './reference-engine-defect.fixture.js';
import { referenceLeadInCandles, runReferenceSignalStep } from './reference-signal.fixture.js';
import { runReferenceWalletStep } from './reference-wallet.fixture.js';

// Referência deliberadamente simples: "sempre comprado" com venda em queda forte e filtro de ganância,
// sobre o modelo de preenchimento completo do ADR 0002 §c. Prova o harness; não é o motor da T2.5.
export const REFERENCE_ENGINE_VERSION = 'reference-2';

const PAST_STAMPING_DEFECTS: readonly ReferenceEngineDefect[] = [
  REFERENCE_ENGINE_DEFECT.LOOKS_AT_FUTURE,
  REFERENCE_ENGINE_DEFECT.SENTIMENT_LOOKAHEAD,
];

type HiddenCounter = { candlesSeen: number; readonly seenOpenTimes: Set<number> };

// O motor que carimba no passado não confere o próprio sinal: a carteira recebe o carimbo de agora.
function walletSignal(
  signal: SignalStepResult['signal'],
  input: StepInput,
  defect: ReferenceEngineDefect,
): SignalDecision | null {
  if (signal === null || !PAST_STAMPING_DEFECTS.includes(defect)) return signal;
  return { ...signal, candleOpenTime: input.candle.openTime };
}

function runReferenceStep(
  input: StepInput,
  defect: ReferenceEngineDefect,
  counter: HiddenCounter,
): StepResult {
  guardInput(defect, () => assertStepInput({ input, engineVersion: REFERENCE_ENGINE_VERSION }));
  if (defect === REFERENCE_ENGINE_DEFECT.MUTATES_INPUT_STATE) {
    Object.assign(input.state, { version: input.state.version });
  }
  const signal = runReferenceSignalStep(
    {
      strategy: input.strategy,
      market: input.run.parameters,
      state: input.state.signal,
      candle: input.candle,
      sentiment: input.sentiment,
      confirmedGapCandles: input.confirmedGapCandles,
    },
    defect,
    counter.candlesSeen,
  );
  const wallet = runReferenceWalletStep(
    {
      strategy: input.strategy,
      run: input.run,
      state: input.state.wallet,
      candle: input.candle,
      signal: walletSignal(signal.signal, input, defect),
      commands: input.commands,
      executionReports: input.executionReports,
      entryRiskScale: input.entryRiskScale,
    },
    defect,
  );
  const isRestep = counter.seenOpenTimes.has(input.candle.openTime);
  counter.seenOpenTimes.add(input.candle.openTime);
  const sequenceShift =
    isRestep && defect === REFERENCE_ENGINE_DEFECT.RESTEP_NOT_IDEMPOTENT ? 1 : 0;
  return {
    state: {
      ...input.state,
      signal: signal.state,
      wallet: { ...wallet.state, sequence: wallet.state.sequence + sequenceShift },
    },
    decisions: { signal: signal.signal, ...wallet.decisions },
  };
}

export function createReferenceEngine(
  defect: ReferenceEngineDefect = REFERENCE_ENGINE_DEFECT.NONE,
): Engine {
  const counter: HiddenCounter = { candlesSeen: 0, seenOpenTimes: new Set() };
  const walletDefect =
    defect === REFERENCE_ENGINE_DEFECT.SPLIT_DIVERGES
      ? REFERENCE_ENGINE_DEFECT.IGNORES_FEE
      : defect;
  return {
    engineVersion: REFERENCE_ENGINE_VERSION,
    createInitialState: ({ strategy, run }): EngineState =>
      createInitialEngineState({
        strategy,
        run,
        engineVersion: REFERENCE_ENGINE_VERSION,
        leadInCandles: referenceLeadInCandles(strategy.config),
      }),
    step: (input): StepResult => {
      counter.candlesSeen += 1;
      return runReferenceStep(input, defect, counter);
    },
    signalStep: (input): SignalStepResult => {
      counter.candlesSeen += 1;
      return runReferenceSignalStep(input, defect, counter.candlesSeen);
    },
    walletStep: (input): WalletStepResult => runReferenceWalletStep(input, walletDefect),
  };
}
