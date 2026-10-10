// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  canonicalJson,
  type EngineCandle,
  type SentimentObservation,
  type SignalState,
  type SignalStepResult,
} from '../../../../packages/strategy-engine/src/index.js';
import {
  deepFreeze,
  FUTURE_PERTURBATION,
  mutateCandlesAfter,
  mutateSentimentAfter,
  withPerturbedEnvironment,
} from '../engine-contract-runs.fixture.js';
import type { SignalApi } from './signal-api.fixture.js';
import type { SignalScenario } from './signal-contract-scenarios.fixture.js';

export const SIGNAL_CONTRACT_CHECK = {
  COMPLETES: 'completes',
  DETERMINISM: 'determinism',
  IMMUTABILITY: 'immutability',
  SERIALIZATION: 'serialization',
  TIMING: 'timing',
  NO_LOOKAHEAD: 'no-lookahead',
  RESUME: 'resume',
  BATCHES: 'batches',
} as const;

export type SignalContractCheck =
  (typeof SIGNAL_CONTRACT_CHECK)[keyof typeof SIGNAL_CONTRACT_CHECK];

export class SignalContractViolation extends Error {
  readonly check: SignalContractCheck;
  readonly scenarioName: string;

  constructor(params: {
    readonly check: SignalContractCheck;
    readonly scenarioName: string;
    readonly detail: string;
  }) {
    super(`[${params.scenarioName}] ${params.check}: ${params.detail}`);
    this.name = 'SignalContractViolation';
    this.check = params.check;
    this.scenarioName = params.scenarioName;
  }
}

export type SignalStep = {
  readonly candle: EngineCandle;
  readonly result: SignalStepResult;
};

type RunParams = {
  readonly api: SignalApi;
  readonly scenario: SignalScenario;
  readonly candles?: readonly EngineCandle[];
  readonly sentiment?: readonly SentimentObservation[];
  readonly initialState?: SignalState;
  readonly shouldFreezeInputs?: boolean;
};

export type CheckContext = {
  readonly api: SignalApi;
  readonly scenario: SignalScenario;
  readonly baseline: readonly SignalStep[];
};

const BATCH_SIZES: readonly number[] = [2, 3, 5, 7];

function assertSignal(condition: boolean, detail: string): void {
  if (!condition) throw new Error(detail);
}

// O que o chamador real faz por candle: a observação disponível no fechamento, da fonte da execução.
export function runSignal(params: RunParams): SignalStep[] {
  const { api, scenario } = params;
  const candles = params.candles ?? scenario.candles;
  const observations = (params.sentiment ?? scenario.sentiment).map((observation) => ({
    ...observation,
    createdAt: observation.observedAt,
  }));
  let state = params.initialState ?? api.createStrategySignalState(scenario.strategy.config);
  const steps: SignalStep[] = [];
  for (const candle of candles) {
    const input = {
      strategy: scenario.strategy,
      market: scenario.market,
      state,
      candle,
      sentiment: api.selectAvailableSentiment({
        observations,
        closeTime: candle.closeTime,
        source: scenario.market.sentimentSource,
        insertionCutoff: candle.closeTime,
      }),
    };
    const result = api.signalStep(params.shouldFreezeInputs === true ? deepFreeze(input) : input);
    steps.push({ candle, result });
    state = result.state;
  }
  return steps;
}

export function serializeSignalRun(run: readonly SignalStep[]): string {
  return JSON.stringify(run.map((step) => step.result));
}

function stateAt(run: readonly SignalStep[], index: number): SignalState {
  const step = run[index];
  if (step === undefined) throw new Error(`Passo ${index} inexistente.`);
  return step.result.state;
}

function runFresh(context: CheckContext, shouldFreezeInputs = false): readonly SignalStep[] {
  return runSignal({ api: context.api, scenario: context.scenario, shouldFreezeInputs });
}

function checkDeterminism(context: CheckContext): void {
  const expected = serializeSignalRun(context.baseline);
  assertSignal(serializeSignalRun(runFresh(context)) === expected, 'Segunda execução divergiu.');
  const perturbed = withPerturbedEnvironment(() => runFresh(context));
  assertSignal(
    serializeSignalRun(perturbed) === expected,
    'Com relógio e aleatoriedade trocados a execução divergiu.',
  );
}

function checkImmutability(context: CheckContext): void {
  assertSignal(
    serializeSignalRun(runFresh(context, true)) === serializeSignalRun(context.baseline),
    'Com as entradas congeladas o resultado mudou.',
  );
}

// O estado vai ao banco como JSON: nada de `undefined`, `Map`, classe ou número não finito.
function checkSerialization(context: CheckContext): void {
  for (const step of context.baseline) {
    const text = canonicalJson(step.result.state);
    assertSignal(
      JSON.stringify(JSON.parse(text)) === JSON.stringify(step.result.state),
      'O estado não volta igual do JSON.',
    );
  }
}

// Nada é decidido no aquecimento; depois, um sinal por candle carimbado com a abertura dele.
function checkTiming(context: CheckContext): void {
  const leadIn = context.api.computeStrategyLeadInCandles(context.scenario.strategy.config);
  context.baseline.forEach((step, index) => {
    const { signal, state } = step.result;
    assertSignal(
      state.processedCandles === index + 1 && state.lastCandleOpenTime === step.candle.openTime,
      `Contadores do estado errados no índice ${index}.`,
    );
    const isDecided = index + 1 >= leadIn;
    assertSignal(
      (signal !== null) === isDecided,
      `Índice ${index}: ${isDecided ? 'faltou' : 'houve'} sinal (aquecimento de ${leadIn} candles).`,
    );
    assertSignal(
      signal === null || signal.candleOpenTime === step.candle.openTime,
      `Sinal do índice ${index} carimbado fora do candle.`,
    );
  });
}

function stampedUpTo(run: readonly SignalStep[], time: number): string {
  const decisions = run
    .map((step) => step.result.signal)
    .filter((signal) => signal !== null && signal.candleOpenTime <= time);
  return JSON.stringify(decisions);
}

function assertPastUnchanged(params: {
  readonly context: CheckContext;
  readonly mutatedRun: readonly SignalStep[];
  readonly cutIndex: number;
  readonly label: string;
}): void {
  const { context, mutatedRun, cutIndex, label } = params;
  const cutTime = context.scenario.candles[cutIndex]?.openTime ?? 0;
  assertSignal(
    stampedUpTo(mutatedRun, cutTime) === stampedUpTo(context.baseline, cutTime),
    `Mudar ${label} depois do índice ${cutIndex} mudou decisões até ele.`,
  );
  assertSignal(
    JSON.stringify(stateAt(mutatedRun, cutIndex)) ===
      JSON.stringify(stateAt(context.baseline, cutIndex)),
    `Mudar ${label} depois do índice ${cutIndex} mudou o estado nele.`,
  );
}

// Para cada corte: futuro ×1,37, ×0,63, constante, permutado e sentimento futuro espelhado.
function checkNoLookahead(context: CheckContext): void {
  const { api, scenario } = context;
  for (let cutIndex = 0; cutIndex < scenario.candles.length - 1; cutIndex += 1) {
    for (const perturbation of Object.values(FUTURE_PERTURBATION)) {
      const candles = mutateCandlesAfter(scenario.candles, cutIndex, perturbation);
      const mutatedRun = runSignal({ api, scenario, candles });
      assertPastUnchanged({ context, mutatedRun, cutIndex, label: `candles (${perturbation})` });
    }
    const cutCloseTime = scenario.candles[cutIndex]?.closeTime ?? 0;
    const sentiment = mutateSentimentAfter(scenario.sentiment, cutCloseTime);
    const mutatedRun = runSignal({ api, scenario, sentiment });
    assertPastUnchanged({ context, mutatedRun, cutIndex, label: 'o sentimento futuro' });
  }
}

function checkResume(context: CheckContext): void {
  const { api, scenario, baseline } = context;
  for (let cutIndex = 0; cutIndex < scenario.candles.length - 1; cutIndex += 1) {
    const restored = JSON.parse(JSON.stringify(stateAt(baseline, cutIndex))) as SignalState;
    const continuation = runSignal({
      api,
      scenario,
      candles: scenario.candles.slice(cutIndex + 1),
      initialState: restored,
    });
    const resumed = [...baseline.slice(0, cutIndex + 1), ...continuation];
    assertSignal(
      serializeSignalRun(resumed) === serializeSignalRun(baseline),
      `Retomar do estado serializado após o índice ${cutIndex} divergiu da execução contínua.`,
    );
  }
}

// Lote × candle a candle: um motor novo por lote, o estado passando de um lote ao seguinte.
function runInBatches(context: CheckContext, batchSize: number): readonly SignalStep[] {
  const { api, scenario } = context;
  const steps: SignalStep[] = [];
  let state = api.createStrategySignalState(scenario.strategy.config);
  for (let start = 0; start < scenario.candles.length; start += batchSize) {
    const batch = runSignal({
      api,
      scenario,
      candles: scenario.candles.slice(start, start + batchSize),
      initialState: state,
    });
    steps.push(...batch);
    state = batch.at(-1)?.result.state ?? state;
  }
  return steps;
}

function checkBatches(context: CheckContext): void {
  for (const batchSize of BATCH_SIZES) {
    assertSignal(
      serializeSignalRun(runInBatches(context, batchSize)) === serializeSignalRun(context.baseline),
      `Lotes de ${batchSize} candles divergiram da execução candle a candle.`,
    );
  }
}

type Verification = (context: CheckContext) => void;

// Ordem importa: determinismo primeiro; carimbo e futuro antes de retomada e lotes.
export const SIGNAL_CONTRACT_CHECKS: readonly (readonly [SignalContractCheck, Verification])[] = [
  [SIGNAL_CONTRACT_CHECK.DETERMINISM, checkDeterminism],
  [SIGNAL_CONTRACT_CHECK.IMMUTABILITY, checkImmutability],
  [SIGNAL_CONTRACT_CHECK.SERIALIZATION, checkSerialization],
  [SIGNAL_CONTRACT_CHECK.TIMING, checkTiming],
  [SIGNAL_CONTRACT_CHECK.NO_LOOKAHEAD, checkNoLookahead],
  [SIGNAL_CONTRACT_CHECK.RESUME, checkResume],
  [SIGNAL_CONTRACT_CHECK.BATCHES, checkBatches],
];

function guard(params: {
  readonly check: SignalContractCheck;
  readonly scenarioName: string;
  readonly run: () => void;
}): void {
  try {
    params.run();
  } catch (error) {
    if (error instanceof SignalContractViolation) throw error;
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new SignalContractViolation({
      check: params.check,
      scenarioName: params.scenarioName,
      detail,
    });
  }
}

export type SignalContractParams = {
  readonly api: SignalApi;
  readonly scenarios: readonly SignalScenario[];
};

// Contrato da metade SINAL (sem carteira): reprova na primeira verificação que falhar, com o nome dela.
export function runSignalContract(params: SignalContractParams): void {
  for (const scenario of params.scenarios) {
    let baseline: readonly SignalStep[] = [];
    guard({
      check: SIGNAL_CONTRACT_CHECK.COMPLETES,
      scenarioName: scenario.name,
      run: () => {
        baseline = runSignal({ api: params.api, scenario });
      },
    });
    const context: CheckContext = { api: params.api, scenario, baseline };
    for (const [check, verify] of SIGNAL_CONTRACT_CHECKS) {
      guard({ check, scenarioName: scenario.name, run: () => verify(context) });
    }
  }
}
