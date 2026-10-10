// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  deserializeEngineState,
  serializeEngineState,
  toEngineDecimal,
  type EngineState,
} from '../../../packages/strategy-engine/src/index.js';
import {
  buildStepInput,
  runSteps,
  serializeRun,
  withPerturbedEnvironment,
} from './engine-contract-runs.fixture.js';
import {
  assertContract,
  type CheckContext,
  type EngineRun,
  type RecordedStep,
} from './engine-contract-types.fixture.js';

function runFresh(context: CheckContext, shouldFreezeInputs = false): EngineRun {
  return runSteps({
    engine: context.createEngine(),
    scenario: context.scenario,
    shouldFreezeInputs,
  });
}

export function stateBefore(context: CheckContext, index: number): EngineState {
  if (index === 0) {
    const { strategy, run } = context.scenario;
    return context.createEngine().createInitialState({ strategy, run });
  }
  return stateAt(context.baseline, index - 1);
}

export function stateAt(run: EngineRun, index: number): EngineState {
  const step = run[index];
  if (step === undefined) throw new Error(`Passo ${index} inexistente.`);
  return step.result.state;
}

export function checkImmutability(context: CheckContext): void {
  const frozenRun = runFresh(context, true);
  assertContract(
    serializeRun(frozenRun) === serializeRun(context.baseline),
    'Com as entradas congeladas o resultado mudou.',
  );
}

export function checkDeterminism(context: CheckContext): void {
  const expected = serializeRun(context.baseline);
  assertContract(serializeRun(runFresh(context)) === expected, 'Segunda execução divergiu.');
  const perturbed = withPerturbedEnvironment(() => runFresh(context));
  assertContract(
    serializeRun(perturbed) === expected,
    'Com relógio e aleatoriedade trocados a execução divergiu.',
  );
}

// O mesmo `step(input)` chamado duas vezes no MESMO motor dá a mesma saída (refazer é seguro).
export function checkRestepIdempotent(context: CheckContext): void {
  const engine = context.createEngine();
  let state = stateBefore(context, 0);
  context.scenario.candles.forEach((candle, index) => {
    const input = buildStepInput({
      scenario: context.scenario,
      state,
      candle,
      sentiment: context.scenario.sentiment,
    });
    const first = JSON.stringify(engine.step(input));
    const second = engine.step(input);
    assertContract(JSON.stringify(second) === first, `Refazer o passo ${index} mudou a saída.`);
    state = second.state;
  });
}

export function checkCashNonNegative(context: CheckContext): void {
  context.baseline.forEach((step, index) => {
    assertContract(
      toEngineDecimal(step.result.state.wallet.cash).gte(0),
      `Passo ${index} deixou o caixa negativo.`,
    );
  });
}

export function checkSerialization(context: CheckContext): void {
  const states = [stateBefore(context, 0), ...context.baseline.map((step) => step.result.state)];
  states.forEach((state, index) => {
    const restored = deserializeEngineState(serializeEngineState(state));
    assertContract(
      Bun.deepEquals(restored, state, true),
      `Estado ${index} não volta igual do JSON.`,
    );
  });
}

// `step` ≡ `walletStep ∘ signalStep`: as metades, chamadas à parte num motor novo, dão o passo inteiro.
export function checkStepComposition(context: CheckContext): void {
  const engine = context.createEngine();
  const { strategy, run } = context.scenario;
  context.baseline.forEach((step, index) => {
    const before = stateBefore(context, index);
    const signal = engine.signalStep({
      strategy,
      market: run.parameters,
      state: before.signal,
      candle: step.candle,
      sentiment: step.sentiment,
      confirmedGapCandles: step.confirmedGapCandles,
    });
    const wallet = engine.walletStep({
      strategy,
      run,
      state: before.wallet,
      candle: step.candle,
      signal: signal.signal,
      commands: step.commands,
    });
    const composed = {
      state: { ...before, signal: signal.state, wallet: wallet.state },
      decisions: { signal: signal.signal, ...wallet.decisions },
    };
    assertContract(
      JSON.stringify(composed) === JSON.stringify(step.result),
      `Passo ${index}: step diverge de walletStep ∘ signalStep.`,
    );
  });
}

function assertStepStamps(step: RecordedStep, index: number): void {
  const { openTime } = step.candle;
  const { decisions } = step.result;
  const stamps = [
    decisions.signal?.candleOpenTime,
    decisions.equityPoint?.candleOpenTime,
    ...decisions.commands.map((command) => command.candleOpenTime),
    ...decisions.orders.map((order) => order.candleOpenTime),
    ...decisions.fills.map((fill) => fill.candleOpenTime),
    ...decisions.openedPositions.map((position) => position.candleOpenTime),
    ...decisions.closedPositions.map((position) => position.candleOpenTime),
  ].filter((stamp) => stamp !== undefined);
  assertContract(
    stamps.every((stamp) => stamp === openTime),
    `Passo ${index} registrou decisão com tempo diferente do candle corrente.`,
  );
}

function assertEntryFilledAfterCreation(step: RecordedStep, index: number): void {
  const { orders, fills } = step.result.decisions;
  for (const fill of fills) {
    const order = orders.find((candidate) => candidate.orderKey === fill.orderKey);
    const isEntry = order?.purpose === 'entry';
    assertContract(
      !isEntry || (order?.createdCandleOpenTime ?? 0) < fill.candleOpenTime,
      `Passo ${index}: entrada preenchida no mesmo candle em que foi decidida.`,
    );
  }
}

function assertSilentWarmup(step: RecordedStep, index: number, leadInCandles: number): void {
  if (index >= leadInCandles - 1) return;
  const { decisions } = step.result;
  const isSilent =
    decisions.signal === null &&
    decisions.equityPoint === null &&
    decisions.orders.length === 0 &&
    decisions.fills.length === 0;
  assertContract(isSilent, `Passo ${index} decidiu durante o aquecimento.`);
}

export function checkTiming(context: CheckContext): void {
  const leadInCandles = stateAt(context.baseline, 0).signal.leadInCandles;
  context.baseline.forEach((step, index) => {
    assertStepStamps(step, index);
    assertEntryFilledAfterCreation(step, index);
    assertSilentWarmup(step, index, leadInCandles);
  });
}
