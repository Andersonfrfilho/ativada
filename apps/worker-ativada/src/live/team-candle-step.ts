// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  applyTeamSignal,
  toHoldProbe,
  toTeamSignal,
  type TeamDecisionRecord,
  type TeamSignal,
} from '@ativada/model-agents';
import { countMissingCandles, type SentimentPicker } from '@ativada/run-recording';
import type {
  Engine,
  EngineCandle,
  EngineState,
  RunSetup,
  SignalDecision,
  SignalState,
  StepResult,
  StrategyVersion,
} from '@ativada/strategy-engine';

export type TeamCandleInputs = {
  readonly engine: Engine;
  readonly strategy: StrategyVersion;
  readonly setup: RunSetup;
  readonly state: EngineState;
  readonly candle: EngineCandle;
  // Abertura do candle anterior já processado; `null` no primeiro candle da execução.
  readonly previousOpenTime: number | null;
  readonly durationMilliseconds: number;
  readonly pickSentiment: SentimentPicker;
};

// A metade SINAL do passo, pura: o `signalStep` real da `model-team-1` (aquecimento = `null`). Roda antes de a decisão da
// equipe ser pedida, para a vela de aquecimento nunca esperar relatório.
export type RealSignal = {
  readonly state: SignalState;
  readonly signal: SignalDecision | null;
};

export function computeRealSignal(inputs: TeamCandleInputs): RealSignal {
  const gapCandles = countMissingCandles({
    previousOpenTime: inputs.previousOpenTime,
    openTime: inputs.candle.openTime,
    durationMilliseconds: inputs.durationMilliseconds,
  });
  return inputs.engine.signalStep({
    strategy: inputs.strategy,
    market: inputs.setup.parameters,
    state: inputs.state.signal,
    candle: inputs.candle,
    sentiment: inputs.pickSentiment(inputs.candle),
    confirmedGapCandles: gapCandles > 0 ? gapCandles : undefined,
  });
}

function runWallet(
  inputs: TeamCandleInputs,
  signal: SignalDecision | null,
): ReturnType<Engine['walletStep']> {
  return inputs.engine.walletStep({
    strategy: inputs.strategy,
    run: inputs.setup,
    state: inputs.state.wallet,
    candle: inputs.candle,
    signal,
  });
}

export type TeamCandleStep = {
  readonly result: StepResult;
  // Ausente no aquecimento (sinal `null` segue `null`).
  readonly teamSignal: TeamSignal | undefined;
};

// A metade CARTEIRA com a decisão da equipe no lugar da regra (D9): sem lookahead (o sinal de `t` só conhece a linha e o
// fechamento de `t`), a ordem executa na abertura de `t + 1` pela carteira existente. A posição que a política de sinal vai
// ver é a de DEPOIS das execuções de `t`, então uma sonda com "esperar" a revela antes de a tradução decidir.
export function finishTeamCandle(
  inputs: TeamCandleInputs,
  params: { readonly real: RealSignal; readonly record: TeamDecisionRecord | null },
): TeamCandleStep {
  const { real, record } = params;
  if (real.signal === null) {
    const wallet = runWallet(inputs, null);
    return {
      result: {
        state: { ...inputs.state, signal: real.state, wallet: wallet.state },
        decisions: { signal: null, ...wallet.decisions },
      },
      teamSignal: undefined,
    };
  }
  const probe = runWallet(inputs, toHoldProbe(real.signal));
  const teamSignal = toTeamSignal({
    record,
    hasPosition: probe.state.position !== null,
    candleOpenTime: inputs.candle.openTime,
  });
  const signal = applyTeamSignal(real.signal, teamSignal);
  const wallet = runWallet(inputs, signal);
  return {
    result: {
      state: { ...inputs.state, signal: real.state, wallet: wallet.state },
      decisions: { signal, ...wallet.decisions },
    },
    teamSignal,
  };
}
