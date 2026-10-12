// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { GapPolicy } from '../../apps/worker-ativada/src/live/gap-policy.js';
import type { EngineCandle } from '../../packages/strategy-engine/src/index.js';
import {
  REAL_DATASETS,
  type RealDataset,
} from '../../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import {
  createBacktestRun,
  createTestRunner,
  seedCandles as seedBacktestCandles,
} from '../backtest-test/backtest-test-context.js';
import { readPersistedRun } from '../backtest-test/read-run-rows.js';
import { HOUR_MILLISECONDS } from './live-test.constant.js';
import {
  assertCondition,
  cancelRun,
  createLiveRun,
  createProductionEvaluator,
  digestOf,
  errorsOf,
  LEAD_IN_CANDLES,
  readProgress,
  reportLine,
  seedCandles,
  tickUntilQuiet,
  type LiveTestContext,
} from './live-test-context.js';

const HOLE_AT = 300;
const HOLE_SIZE = 3;
const CONFIRM_AFTER = 3;
const MINIMUM_AGE = 600_000;
const LOOKBACK = 168 * HOUR_MILLISECONDS;

type Clock = { age: number; recovery: number };

type WaitRow = {
  readonly waiting_since: string | null;
  readonly waiting_open_time: string | null;
  readonly waiting_failed_recoveries: number;
};

function requireDataset(): RealDataset {
  const dataset = REAL_DATASETS[0];
  if (dataset === undefined) throw new Error('sem conjunto real');
  return dataset;
}

function withHole(candles: readonly EngineCandle[]): EngineCandle[] {
  return candles.filter((_candle, index) => index < HOLE_AT || index >= HOLE_AT + HOLE_SIZE);
}

// O relógio do worker é de teste: a idade do buraco e o fim da última recuperação limpa são controlados à mão, e cada
// "worker" nasce com a PRÓPRIA memória (a recuperação limpa começa em 0), como depois de um reinício.
function policyOf(params: { readonly clock: Clock; readonly lastMissingClose: number }): GapPolicy {
  return {
    now: () => params.lastMissingClose + params.clock.age,
    lastCleanRecoveryAt: () => params.clock.recovery,
    confirmAfterFailedRecoveries: CONFIRM_AFTER,
    minimumGapAgeMilliseconds: MINIMUM_AGE,
    recoveryLookbackMilliseconds: LOOKBACK,
  };
}

async function readWait(context: LiveTestContext, runId: string): Promise<WaitRow> {
  const rows: unknown = await context.client.unsafe(
    'SELECT waiting_since::text, waiting_open_time::text, waiting_failed_recoveries FROM runs WHERE id = $1',
    [runId],
  );
  const row = (rows as readonly WaitRow[])[0];
  if (row === undefined) throw new Error('execução inexistente');
  return row;
}

function finishRecoveryRound(clock: Clock, lastMissingClose: number): void {
  clock.age += 1;
  clock.recovery = lastMissingClose + clock.age;
}

async function checkHoleSurvivesRestart(context: LiveTestContext): Promise<void> {
  const dataset = requireDataset();
  const first = dataset.candles[LEAD_IN_CANDLES];
  const lastMissing = dataset.candles[HOLE_AT + HOLE_SIZE - 1];
  if (first === undefined || lastMissing === undefined) throw new Error('sem conjunto real');
  const lastMissingClose = lastMissing.openTime + HOUR_MILLISECONDS;
  const symbol = 'LTCUSDT';
  const holey = withHole(dataset.candles);
  await seedCandles(context, holey, { symbol });
  const run = await createLiveRun(context, {
    symbol,
    timeframe: '1h',
    periodStart: first.openTime,
  });
  const clock: Clock = { age: 2 * HOUR_MILLISECONDS, recovery: 0 };
  const before = createProductionEvaluator(context, {
    instanceId: 'gap-evidence-before',
    gapPolicy: policyOf({ clock, lastMissingClose }),
  });
  await tickUntilQuiet(before.evaluator);
  const waiting = await readWait(context, run.id);
  assertCondition(
    waiting.waiting_open_time === String(dataset.candles[HOLE_AT]?.openTime) &&
      waiting.waiting_since === String(lastMissingClose + 2 * HOUR_MILLISECONDS) &&
      waiting.waiting_failed_recoveries === 0,
    `a espera devia estar GRAVADA na execução: ${JSON.stringify(waiting)}`,
  );
  for (const round of [1, 2]) {
    finishRecoveryRound(clock, lastMissingClose);
    await tickUntilQuiet(before.evaluator);
    assertCondition(
      (await readWait(context, run.id)).waiting_failed_recoveries === round,
      `recuperação ${round} não foi contada`,
    );
  }
  await before.evaluator.release();
  const restartedClock: Clock = { age: clock.age, recovery: 0 };
  const after = createProductionEvaluator(context, {
    instanceId: 'gap-evidence-after',
    gapPolicy: policyOf({ clock: restartedClock, lastMissingClose }),
  });
  await tickUntilQuiet(after.evaluator);
  const survived = await readWait(context, run.id);
  assertCondition(
    survived.waiting_failed_recoveries === 2 && survived.waiting_since === waiting.waiting_since,
    `o reinício perdeu a contagem: ${JSON.stringify(survived)}`,
  );
  assertCondition(
    (await readProgress(context, run.id)).lastCandleTime === dataset.candles[HOLE_AT - 1]?.openTime,
    'o worker novo avançou sem a evidência',
  );
  finishRecoveryRound(restartedClock, lastMissingClose);
  await tickUntilQuiet(after.evaluator);
  const last = holey.at(-1);
  assertCondition(
    (await readProgress(context, run.id)).lastCandleTime === last?.openTime,
    'confirmado o buraco, a simulação devia alcançar o fim e não ficar presa',
  );
  const cleared = await readWait(context, run.id);
  assertCondition(
    cleared.waiting_since === null && cleared.waiting_open_time === null,
    'atravessado o buraco, a espera devia sumir',
  );
  await compareWithBacktest(context, { runId: run.id, symbol, candles: holey, firstOpen: first });
  assertCondition(errorsOf(before.entries).length + errorsOf(after.entries).length === 0, 'erro');
  await cancelRun(context, { runId: run.id });
  reportLine(
    `buraco no meio + reinício do worker: espera gravada na execução, 2 recuperações contadas antes do reinício e 1 depois confirmam o buraco (${CONFIRM_AFTER}); a simulação chega ao fim e é IDÊNTICA ao backtest com o mesmo buraco`,
  );
}

async function compareWithBacktest(
  context: LiveTestContext,
  params: {
    readonly runId: string;
    readonly symbol: string;
    readonly candles: readonly EngineCandle[];
    readonly firstOpen: EngineCandle;
  },
): Promise<void> {
  const live = await readPersistedRun(context.backtest, params.runId);
  await seedBacktestCandles(
    context.backtest,
    params.candles.map((candle) => ({ ...candle, symbol: params.symbol })),
  );
  const backtestRun = await createBacktestRun(context.backtest, {
    symbol: params.symbol,
    timeframe: '1h',
    periodStart: params.firstOpen.openTime,
    periodEnd: (params.candles.at(-1)?.closeTime ?? 0) + 1,
  });
  const outcome = await createTestRunner(context.backtest).run(backtestRun.id);
  assertCondition(outcome.status === 'completed', 'backtest com buraco não terminou');
  const backtest = await readPersistedRun(context.backtest, backtestRun.id);
  assertCondition(digestOf(live.rows) === digestOf(backtest.rows), 'o ao vivo difere do backtest');
}

async function checkHoleBeyondRecoveryReach(context: LiveTestContext): Promise<void> {
  const dataset = requireDataset();
  const first = dataset.candles[LEAD_IN_CANDLES];
  const lastMissing = dataset.candles[HOLE_AT + HOLE_SIZE - 1];
  if (first === undefined || lastMissing === undefined) throw new Error('sem conjunto real');
  const lastMissingClose = lastMissing.openTime + HOUR_MILLISECONDS;
  const symbol = 'DOTUSDT';
  const holey = withHole(dataset.candles);
  await seedCandles(context, holey, { symbol });
  const run = await createLiveRun(context, {
    symbol,
    timeframe: '1h',
    periodStart: first.openTime,
  });
  const clock: Clock = { age: LOOKBACK + HOUR_MILLISECONDS, recovery: 0 };
  const { evaluator, entries } = createProductionEvaluator(context, {
    instanceId: 'gap-evidence-old',
    gapPolicy: policyOf({ clock, lastMissingClose }),
  });
  await tickUntilQuiet(evaluator);
  assertCondition(
    (await readProgress(context, run.id)).lastCandleTime === holey.at(-1)?.openTime,
    'o buraco além do alcance da recuperação deixou a simulação presa',
  );
  assertCondition((await readWait(context, run.id)).waiting_since === null, 'espera sobrou');
  assertCondition(errorsOf(entries).length === 0, 'erro registrado');
  await cancelRun(context, { runId: run.id });
  reportLine(
    'buraco mais velho que a janela da recuperação: confirmado por idade, a simulação não fica presa para sempre',
  );
}

export async function checkGapEvidence(context: LiveTestContext): Promise<void> {
  await checkHoleSurvivesRestart(context);
  await checkHoleBeyondRecoveryReach(context);
}
