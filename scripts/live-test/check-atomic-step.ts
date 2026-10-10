// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readPersistedRun } from '../backtest-test/read-run-rows.js';
import { REAL_DATASETS } from '../../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import {
  assertCondition,
  cancelRun,
  createLiveRun,
  createProductionEvaluator,
  digestOf,
  LEAD_IN_CANDLES,
  readProgress,
  reportLine,
  tickUntilQuiet,
  type LiveTestContext,
} from './live-test-context.js';

const FAULT_AT_CANDLE = 260;
const STEPS_BEFORE_FAULT = FAULT_AT_CANDLE;
const RETRY_TICKS = 3;

// O banco recusa (exceção do gatilho) a atualização do checkpoint daquele passo, DEPOIS de as linhas dele terem entrado na
// transação: se o passo for mesmo UMA transação, nenhuma linha dele sobra; solto o defeito, a simulação retoma e termina igual.
async function installFault(context: LiveTestContext, lastCandleTime: number): Promise<void> {
  await context.client.unsafe(
    `CREATE OR REPLACE FUNCTION live_test_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha injetada'; END $$`,
  );
  await context.client.unsafe(
    `CREATE TRIGGER live_test_fault BEFORE UPDATE ON runs FOR EACH ROW WHEN (NEW.last_candle_time = ${lastCandleTime}) EXECUTE FUNCTION live_test_fault()`,
  );
}

async function countRowsAfter(
  context: LiveTestContext,
  runId: string,
  candleTime: number,
): Promise<number> {
  const rows: unknown = await context.client.unsafe(
    `SELECT (SELECT count(*) FROM signals WHERE run_id = $1 AND candle_time >= $2) + (SELECT count(*) FROM equity_points WHERE run_id = $1 AND candle_time >= $2) AS total`,
    [runId, candleTime],
  );
  return Number((rows as readonly { total: string | number }[])[0]?.total ?? -1);
}

export async function checkAtomicStep(context: LiveTestContext): Promise<void> {
  const dataset = REAL_DATASETS[0];
  const reference = dataset === undefined ? undefined : context.references.get(dataset.name);
  const first = dataset?.candles[LEAD_IN_CANDLES];
  const faulty = dataset?.candles[FAULT_AT_CANDLE];
  const before = dataset?.candles[FAULT_AT_CANDLE - 1];
  if (
    dataset === undefined ||
    reference === undefined ||
    first === undefined ||
    faulty === undefined ||
    before === undefined
  ) {
    throw new Error('sem a referência da paridade');
  }
  const run = await createLiveRun(context, {
    symbol: dataset.market.symbol,
    timeframe: '1h',
    periodStart: first.openTime,
  });
  await installFault(context, faulty.openTime);
  const { evaluator, entries } = createProductionEvaluator(context, { instanceId: 'atomic' });
  await tickUntilQuiet(evaluator);
  const stuck = await readProgress(context, run.id);
  assertCondition(
    stuck.lastCandleTime === before.openTime,
    `o checkpoint avançou além do passo recusado (${stuck.lastCandleTime})`,
  );
  assertCondition(
    stuck.status === 'running' && stuck.errorCode === null,
    'a recusa do banco falhou a execução',
  );
  const leftovers = await countRowsAfter(context, run.id, faulty.openTime);
  assertCondition(
    leftovers === 0,
    `o passo recusado deixou ${leftovers} linha(s): não é uma transação só`,
  );
  for (let tick = 0; tick < RETRY_TICKS; tick += 1) await evaluator.tick();
  assertCondition(
    (await countRowsAfter(context, run.id, faulty.openTime)) === 0,
    'a repetição deixou linhas',
  );
  assertCondition(
    entries.some((entry) => entry.message === 'live run will be retried'),
    'o erro do banco devia ser tratado como repetível',
  );
  await context.client.unsafe('DROP TRIGGER live_test_fault ON runs');
  await tickUntilQuiet(evaluator);
  const persisted = await readPersistedRun(context.backtest, run.id);
  assertCondition(
    digestOf(persisted.rows) === reference.rowsDigest,
    'depois do defeito, o resultado difere do contínuo',
  );
  await cancelRun(context, { runId: run.id });
  reportLine(
    `passo = UMA transação: com o banco recusando o checkpoint do passo ${STEPS_BEFORE_FAULT} (depois das linhas dele), nenhuma linha dele sobra e a simulação espera repetindo; solto o defeito, termina IDÊNTICA à contínua (digest ${digestOf(persisted.rows).slice(0, 16)})`,
  );
}
