// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SignalInput } from '../../packages/database/src/index.js';
import { classicSetup, runReference } from '../../test/fixtures/live/live-scenarios.fixture.js';
import { REAL_DATASETS } from '../../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import {
  createLiveRun,
  createProductionEvaluator,
  LEAD_IN_CANDLES,
  readProgress,
  tickUntilQuiet,
  type LiveUser,
} from '../live-test/live-test-context.js';
import { EVALUATOR_PASS_STEPS, FRESH_FOREVER_CANDLES } from './telegram-test.constant.js';
import {
  assertCondition,
  countSignalsToAlert,
  readAlerts,
  reportTelegramLine,
  type TelegramTestContext,
} from './telegram-test-context.js';

const FAULT_NAME = 'telegram_test_fault';
const EXTRA_CANDLES_AFTER_FIRST_SIGNAL = 5;

// O banco recusa (exceção do gatilho) o checkpoint do candle de um sinal DEPOIS de as linhas e o alerta dele terem entrado na
// transação: se o alerta nasce no passo, a recusa o leva junto; solto o defeito, o passo repete e o alerta nasce uma vez só.
async function installFault(context: TelegramTestContext, lastCandleTime: number): Promise<void> {
  const { client } = context.live;
  await client.unsafe(
    `CREATE OR REPLACE FUNCTION ${FAULT_NAME}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha injetada'; END $$`,
  );
  await client.unsafe(
    `CREATE TRIGGER ${FAULT_NAME} BEFORE UPDATE ON runs FOR EACH ROW WHEN (NEW.last_candle_time = ${lastCandleTime}) EXECUTE FUNCTION ${FAULT_NAME}()`,
  );
}

export async function checkAtomicAlert(
  context: TelegramTestContext,
  user: LiveUser,
): Promise<void> {
  const dataset = REAL_DATASETS[1];
  const first = dataset?.candles[LEAD_IN_CANDLES];
  if (dataset === undefined || first === undefined) throw new Error('conjunto real ausente');
  const reference = runReference({ setup: classicSetup(dataset), candles: dataset.candles });
  const signals = reference.rows['signals'] as readonly SignalInput[];
  const target = signals.filter((signal) => signal.action !== 'HOLD')[
    EXTRA_CANDLES_AFTER_FIRST_SIGNAL
  ];
  if (target === undefined) throw new Error('o conjunto não tem sinais suficientes');
  const run = await createLiveRun(context.live, {
    symbol: dataset.market.symbol,
    timeframe: '1d',
    periodStart: first.openTime,
    user,
  });
  await installFault(context, target.candleTime);
  const lastClose = dataset.candles.at(-1)?.closeTime ?? 0;
  const { evaluator } = createProductionEvaluator(context.live, {
    instanceId: 'telegram-test-atomic',
    maxStepsPerPass: EVALUATOR_PASS_STEPS,
    alerting: { now: () => lastClose, maxAgeCandles: FRESH_FOREVER_CANDLES },
  });
  await tickUntilQuiet(evaluator);
  const stuck = await readProgress(context.live, run.id);
  assertCondition(
    (stuck.lastCandleTime ?? 0) < target.candleTime,
    'o checkpoint passou do passo recusado',
  );
  const leftovers = (await readAlerts(context, { runId: run.id })).filter(
    (row) => Number(row.candle_time) >= target.candleTime,
  );
  assertCondition(
    leftovers.length === 0,
    `o passo recusado deixou ${leftovers.length} alerta(s): o alerta não está na transação do passo`,
  );
  await context.live.client.unsafe(`DROP TRIGGER ${FAULT_NAME} ON runs`);
  await tickUntilQuiet(evaluator);
  const alerts = await readAlerts(context, { runId: run.id });
  const expected = await countSignalsToAlert(context, run.id);
  assertCondition(alerts.length === expected, `alertas ${alerts.length} para ${expected} sinais`);
  assertCondition(
    alerts.filter((row) => Number(row.candle_time) === target.candleTime).length === 1,
    'o alerta do candle recusado não nasceu exatamente uma vez depois da repetição',
  );
  reportTelegramLine(
    `atomicidade: com o banco recusando o checkpoint do candle de um sinal, nenhum alerta dele sobra; solto o defeito, o passo repete e o alerta nasce uma vez só (${alerts.length} = ${expected} sinais)`,
  );
}
