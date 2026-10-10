// Copyright (c) 2026 Ada Technology. All rights reserved.
import { REAL_DATASETS } from '../../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import { readPersistedRun } from '../backtest-test/read-run-rows.js';
import {
  assertCondition,
  cancelRun,
  createLiveRun,
  createProductionEvaluator,
  digestOf,
  errorsOf,
  LEAD_IN_CANDLES,
  openLiveDatabase,
  reportLine,
  seedCandles,
  tickUntilQuiet,
  type LiveTestContext,
} from './live-test-context.js';

const FUTURE_SIGNAL_TIME = 4_000_000_000_000;

// Candle repetido é ignorado: o stream reentrega a vela (o upsert não a duplica), a ronda seguinte não dá passo, e um passo
// de um candle JÁ gravado é recusado sem deixar linha nenhuma (a transação inteira é desfeita).
export async function checkDuplicates(context: LiveTestContext): Promise<void> {
  const dataset = REAL_DATASETS[0];
  const reference = dataset === undefined ? undefined : context.references.get(dataset.name);
  const first = dataset?.candles[LEAD_IN_CANDLES];
  if (dataset === undefined || reference === undefined || first === undefined) {
    throw new Error('sem a referência da paridade');
  }
  const { symbol } = dataset.market;
  const run = await createLiveRun(context, {
    symbol,
    timeframe: '1h',
    periodStart: first.openTime,
  });
  const { evaluator, entries } = createProductionEvaluator(context, { instanceId: 'duplicates' });
  await tickUntilQuiet(evaluator);
  const before = await readPersistedRun(context.backtest, run.id);
  await seedCandles(context, dataset.candles);
  const again = await tickUntilQuiet(evaluator);
  const after = await readPersistedRun(context.backtest, run.id);
  assertCondition(again.steps === 0, `a vela reentregue gerou ${again.steps} passo(s)`);
  assertCondition(
    digestOf(after.rows) === digestOf(before.rows),
    'a vela reentregue mudou as linhas',
  );
  const session = await openLiveDatabase(context).attach(run.id);
  assertCondition(session !== undefined, 'sessão da simulação');
  const checkpoint = await session?.readCheckpoint();
  const refused = await session?.commitStep({
    alerts: [],
    rows: {
      signals: [
        {
          candleTime: FUTURE_SIGNAL_TIME,
          action: 'HOLD',
          score: '0',
          regime: 'none',
          votes: [],
          indicators: {},
          sentimentObservation: undefined,
          reason: 'linha que não pode ficar',
        },
      ],
      orders: [],
      fills: [],
      positions: [],
      equityPoints: [],
      commands: [],
    },
    checkpoint: {
      engineState: (checkpoint?.engineState ?? {}) as Record<string, never>,
      lastCandleTime: reference.lastCandleTime,
      progress: 0,
    },
  });
  assertCondition(refused === 'already_recorded', `passo repetido respondeu ${String(refused)}`);
  const rows: unknown = await context.client.unsafe(
    'SELECT count(*)::int AS total FROM signals WHERE run_id = $1 AND candle_time = $2',
    [run.id, FUTURE_SIGNAL_TIME],
  );
  assertCondition(
    (rows as { total: number }[])[0]?.total === 0,
    'o passo recusado deixou uma linha',
  );
  assertCondition(errorsOf(entries).length === 0, 'erro registrado');
  await cancelRun(context, { runId: run.id });
  reportLine(
    'candle repetido: a vela reentregue não gera passo nem muda uma linha (digest igual) e o passo de um candle já gravado é recusado com a transação desfeita',
  );
}
