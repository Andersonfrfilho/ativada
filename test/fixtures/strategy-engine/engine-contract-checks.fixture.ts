// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  deserializeEngineState,
  serializeEngineState,
  type EngineState,
} from '../../../packages/strategy-engine/src/index.js';
import {
  decisionsStampedUpTo,
  mutateCandlesAfter,
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

const BATCH_SIZES: readonly number[] = [2, 3, 5, 7];

function runFresh(context: CheckContext, shouldFreezeInputs = false): EngineRun {
  const { scenario } = context;
  return runSteps({
    engine: context.createEngine(),
    strategy: scenario.strategy,
    candles: scenario.candles,
    shouldFreezeInputs,
  });
}

function stateAt(run: EngineRun, index: number): EngineState {
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

export function checkSerialization(context: CheckContext): void {
  const states = [
    context.createEngine().createInitialState(context.scenario.strategy),
    ...context.baseline.map((step) => step.result.state),
  ];
  states.forEach((state, index) => {
    const restored = deserializeEngineState(serializeEngineState(state));
    assertContract(
      Bun.deepEquals(restored, state, true),
      `Estado ${index} não volta igual do JSON.`,
    );
  });
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

function assertStepStamps(step: RecordedStep, index: number): void {
  const { openTime } = step.candle;
  const { decisions } = step.result;
  const stamps = [
    decisions.signal?.candleOpenTime,
    decisions.equityPoint?.candleOpenTime,
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
  const leadInCandles = stateAt(context.baseline, 0).leadInCandles;
  context.baseline.forEach((step, index) => {
    assertStepStamps(step, index);
    assertEntryFilledAfterCreation(step, index);
    assertSilentWarmup(step, index, leadInCandles);
  });
}

export function checkNoLookahead(context: CheckContext): void {
  const { scenario, baseline } = context;
  for (let cutIndex = 0; cutIndex < scenario.candles.length - 1; cutIndex += 1) {
    const cutTime = scenario.candles[cutIndex]?.openTime ?? 0;
    const mutatedRun = runSteps({
      engine: context.createEngine(),
      strategy: scenario.strategy,
      candles: mutateCandlesAfter(scenario.candles, cutIndex),
    });
    assertContract(
      decisionsStampedUpTo(mutatedRun, cutTime) === decisionsStampedUpTo(baseline, cutTime),
      `Mudar candles depois do índice ${cutIndex} mudou decisões até ele.`,
    );
    assertContract(
      JSON.stringify(stateAt(mutatedRun, cutIndex)) === JSON.stringify(stateAt(baseline, cutIndex)),
      `Mudar candles depois do índice ${cutIndex} mudou o estado nele.`,
    );
  }
}

export function checkResume(context: CheckContext): void {
  const { scenario, baseline } = context;
  for (let cutIndex = 0; cutIndex < scenario.candles.length - 1; cutIndex += 1) {
    const restored = deserializeEngineState(serializeEngineState(stateAt(baseline, cutIndex)));
    const continuation = runSteps({
      engine: context.createEngine(),
      strategy: scenario.strategy,
      candles: scenario.candles.slice(cutIndex + 1),
      initialState: restored,
    });
    const resumedRun = [...baseline.slice(0, cutIndex + 1), ...continuation];
    assertContract(
      serializeRun(resumedRun) === serializeRun(baseline),
      `Retomar do estado serializado após o índice ${cutIndex} divergiu da execução contínua.`,
    );
  }
}

function runInBatches(context: CheckContext, batchSize: number): EngineRun {
  const { scenario } = context;
  const steps: RecordedStep[] = [];
  let state = context.createEngine().createInitialState(scenario.strategy);
  for (let start = 0; start < scenario.candles.length; start += batchSize) {
    const batch = runSteps({
      engine: context.createEngine(),
      strategy: scenario.strategy,
      candles: scenario.candles.slice(start, start + batchSize),
      initialState: state,
    });
    steps.push(...batch);
    state = batch.at(-1)?.result.state ?? state;
  }
  return steps;
}

export function checkBatches(context: CheckContext): void {
  for (const batchSize of BATCH_SIZES) {
    assertContract(
      serializeRun(runInBatches(context, batchSize)) === serializeRun(context.baseline),
      `Lotes de ${batchSize} candles divergiram da execução contínua.`,
    );
  }
}
