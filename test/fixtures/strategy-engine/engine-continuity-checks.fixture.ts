// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  deserializeEngineState,
  ENGINE_INPUT_ERROR_CODE,
  EngineInputError,
  formatEngineDecimal,
  serializeEngineState,
  toEngineDecimal,
  type EngineInputErrorCode,
  type StepInput,
} from '../../../packages/strategy-engine/src/index.js';
import { stateAt, stateBefore } from './engine-contract-checks.fixture.js';
import {
  buildStepInput,
  decisionsStampedUpTo,
  FUTURE_PERTURBATION,
  mutateCandlesAfter,
  mutateSentimentAfter,
  runSteps,
  serializeRun,
} from './engine-contract-runs.fixture.js';
import {
  assertContract,
  type CheckContext,
  type EngineRun,
  type RecordedStep,
} from './engine-contract-types.fixture.js';

const BATCH_SIZES: readonly number[] = [2, 3, 5, 7];
const ONE_MILLISECOND = 1;

function above(price: string): string {
  return formatEngineDecimal(toEngineDecimal(price).plus(1));
}

function assertPastUnchanged(params: {
  readonly context: CheckContext;
  readonly mutatedRun: EngineRun;
  readonly cutIndex: number;
  readonly label: string;
}): void {
  const { context, mutatedRun, cutIndex, label } = params;
  const cutTime = context.scenario.candles[cutIndex]?.openTime ?? 0;
  assertContract(
    decisionsStampedUpTo(mutatedRun, cutTime) === decisionsStampedUpTo(context.baseline, cutTime),
    `Mudar ${label} depois do índice ${cutIndex} mudou decisões até ele.`,
  );
  assertContract(
    JSON.stringify(stateAt(mutatedRun, cutIndex)) ===
      JSON.stringify(stateAt(context.baseline, cutIndex)),
    `Mudar ${label} depois do índice ${cutIndex} mudou o estado nele.`,
  );
}

// Para cada corte: futuro ×1,37, ×0,63, constante, permutado, e sentimento futuro espelhado.
export function checkNoLookahead(context: CheckContext): void {
  const { scenario } = context;
  for (let cutIndex = 0; cutIndex < scenario.candles.length - 1; cutIndex += 1) {
    for (const perturbation of Object.values(FUTURE_PERTURBATION)) {
      const mutatedRun = runSteps({
        engine: context.createEngine(),
        scenario,
        candles: mutateCandlesAfter(scenario.candles, cutIndex, perturbation),
      });
      assertPastUnchanged({ context, mutatedRun, cutIndex, label: `candles (${perturbation})` });
    }
    const cutCloseTime = scenario.candles[cutIndex]?.closeTime ?? 0;
    const mutatedRun = runSteps({
      engine: context.createEngine(),
      scenario,
      sentiment: mutateSentimentAfter(scenario.sentiment, cutCloseTime),
    });
    assertPastUnchanged({ context, mutatedRun, cutIndex, label: 'o sentimento futuro' });
  }
}

export function checkResume(context: CheckContext): void {
  const { scenario, baseline } = context;
  for (let cutIndex = 0; cutIndex < scenario.candles.length - 1; cutIndex += 1) {
    const restored = deserializeEngineState(serializeEngineState(stateAt(baseline, cutIndex)));
    const continuation = runSteps({
      engine: context.createEngine(),
      scenario,
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
  let state = stateBefore(context, 0);
  for (let start = 0; start < scenario.candles.length; start += batchSize) {
    const batch = runSteps({
      engine: context.createEngine(),
      scenario,
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

type GuardCase = {
  readonly label: string;
  readonly code: EngineInputErrorCode;
  readonly input: StepInput;
};

function refusalCode(context: CheckContext, input: StepInput): string {
  try {
    context.createEngine().step(input);
    return 'aceito';
  } catch (error) {
    if (error instanceof EngineInputError) return error.code;
    return error instanceof Error ? error.name : String(error);
  }
}

// Outro par que o da execução, qualquer que seja ele.
function otherSymbol(symbol: string): string {
  return symbol === 'ETHUSDT' ? 'BTCUSDT' : 'ETHUSDT';
}

function guardCases(context: CheckContext): GuardCase[] {
  const { scenario } = context;
  const [, second, third, fourth] = scenario.candles;
  if (second === undefined || third === undefined || fourth === undefined) {
    throw new Error('Cenário curto demais para as guardas de entrada.');
  }
  const base = buildStepInput({
    scenario,
    state: stateAt(context.baseline, 1),
    candle: third,
    sentiment: [],
  });
  const code = ENGINE_INPUT_ERROR_CODE;
  const sentiment = { value: 40, observedAt: third.closeTime, source: 'guard' };
  return [
    { label: 'repetido', code: code.CANDLE_ALREADY_PROCESSED, input: { ...base, candle: second } },
    {
      label: 'fora de ordem',
      code: code.CANDLE_OUT_OF_ORDER,
      input: { ...base, candle: scenario.candles[0] ?? second },
    },
    {
      label: 'lacuna sem confirmação',
      code: code.CANDLE_GAP_UNCONFIRMED,
      input: { ...base, candle: fourth },
    },
    {
      label: 'lacuna declarada errada',
      code: code.CANDLE_GAP_UNCONFIRMED,
      input: { ...base, candle: fourth, confirmedGapCandles: 2 },
    },
    {
      label: 'outro par',
      code: code.CANDLE_WRONG_MARKET,
      input: { ...base, candle: { ...third, symbol: otherSymbol(scenario.run.parameters.symbol) } },
    },
    {
      label: 'fora da grade',
      code: code.CANDLE_OFF_GRID,
      input: { ...base, candle: { ...third, closeTime: third.closeTime + ONE_MILLISECOND } },
    },
    {
      label: 'preço zero',
      code: code.CANDLE_INSANE,
      input: { ...base, candle: { ...third, low: '0' } },
    },
    {
      label: 'mínima acima da máxima',
      code: code.CANDLE_INSANE,
      input: { ...base, candle: { ...third, low: above(third.high) } },
    },
    {
      label: 'volume negativo',
      code: code.CANDLE_INSANE,
      input: { ...base, candle: { ...third, volume: '-1' } },
    },
    {
      label: 'expoente',
      code: code.CANDLE_INSANE,
      input: { ...base, candle: { ...third, open: '1e2' } },
    },
    {
      label: 'sentimento NaN',
      code: code.SENTIMENT_INVALID,
      input: { ...base, sentiment: { ...sentiment, value: Number.NaN } },
    },
    {
      label: 'sentimento fracionário',
      code: code.SENTIMENT_INVALID,
      input: { ...base, sentiment: { ...sentiment, value: 40.5 } },
    },
    {
      label: 'sentimento acima de 100',
      code: code.SENTIMENT_INVALID,
      input: { ...base, sentiment: { ...sentiment, value: 101 } },
    },
    {
      label: 'sentimento do futuro',
      code: code.SENTIMENT_FROM_FUTURE,
      input: {
        ...base,
        sentiment: { ...sentiment, observedAt: third.closeTime + ONE_MILLISECOND },
      },
    },
    {
      label: 'outra estratégia',
      code: code.CONFIG_HASH_MISMATCH,
      input: { ...base, strategy: { ...base.strategy, configHash: 'f'.repeat(64) } },
    },
    {
      label: 'outros parâmetros',
      code: code.RUN_HASH_MISMATCH,
      input: { ...base, run: { ...base.run, runHash: 'e'.repeat(64) } },
    },
    {
      label: 'comando do futuro',
      code: code.COMMAND_INVALID,
      input: {
        ...base,
        commands: [
          {
            commandId: 'c-1',
            issuedAt: third.closeTime + ONE_MILLISECOND,
            kind: 'halt',
            reason: 'user_stop',
          },
        ],
      },
    },
    {
      label: 'comando repetido',
      code: code.COMMAND_INVALID,
      input: {
        ...base,
        commands: [
          { commandId: 'c-1', issuedAt: third.openTime, kind: 'halt', reason: 'user_stop' },
          { commandId: 'c-1', issuedAt: third.openTime, kind: 'resume', reason: 'user_resume' },
        ],
      },
    },
  ];
}

// Recusa em voz alta, com o código certo, e aceita a lacuna declarada com a contagem exata.
export function checkInputGuards(context: CheckContext): void {
  for (const guard of guardCases(context)) {
    const received = refusalCode(context, guard.input);
    assertContract(
      received === guard.code,
      `Entrada "${guard.label}": esperado ${guard.code}, veio ${received}.`,
    );
  }
  const { scenario } = context;
  const [, , third, fourth] = scenario.candles;
  if (third === undefined || fourth === undefined) return;
  const declared = {
    ...buildStepInput({
      scenario,
      state: stateAt(context.baseline, 1),
      candle: fourth,
      sentiment: [],
    }),
    confirmedGapCandles: 1,
  };
  assertContract(
    refusalCode(context, declared) === 'aceito',
    'Lacuna declarada com a contagem exata foi recusada.',
  );
}
