// Copyright (c) 2026 Ada Technology. All rights reserved.
import { REAL_DATASETS } from '../../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import {
  assertCondition,
  createLiveRun,
  createProductionEvaluator,
  LEAD_IN_CANDLES,
  readProgress,
  reportLine,
  seedCandles,
  tickUntilQuiet,
  type LiveTestContext,
} from './live-test-context.js';

const SHORT_HISTORY = 40;

type FailureRow = {
  readonly status: string;
  readonly error_code: string | null;
  readonly claimed_by: string | null;
  readonly finished: boolean;
};

async function readFailure(
  context: LiveTestContext,
  runId: string,
): Promise<FailureRow | undefined> {
  const rows: unknown = await context.client.unsafe(
    'SELECT status, error_code, claimed_by, finished_at IS NOT NULL AS finished FROM runs WHERE id = $1',
    [runId],
  );
  return (rows as readonly FailureRow[])[0];
}

function expectTypedFailure(label: string, row: FailureRow | undefined, code: string): void {
  assertCondition(
    row?.status === 'failed' && row.error_code === code && row.finished && row.claimed_by === null,
    `${label}: esperado failed/${code} encerrada e sem posse, obtido ${JSON.stringify(row)}`,
  );
}

// Falha tipada gravada no banco de verdade: só o CÓDIGO estável (nunca texto de erro), com a execução encerrada e sem posse.
export async function checkTypedFailures(context: LiveTestContext): Promise<void> {
  const dataset = REAL_DATASETS[0];
  const first = dataset?.candles[LEAD_IN_CANDLES];
  if (dataset === undefined || first === undefined) throw new Error('sem conjunto real');
  const symbol = 'XRPUSDT';
  await seedCandles(context, dataset.candles.slice(LEAD_IN_CANDLES - SHORT_HISTORY), { symbol });
  const shortHistory = await createLiveRun(context, {
    symbol,
    timeframe: '1h',
    periodStart: first.openTime,
  });
  const tampered = await createLiveRun(context, {
    symbol: dataset.market.symbol,
    timeframe: '1h',
    periodStart: first.openTime,
  });
  await context.client.unsafe('UPDATE runs SET run_hash = $2 WHERE id = $1', [
    tampered.id,
    'f'.repeat(64),
  ]);
  const { evaluator, entries } = createProductionEvaluator(context, { instanceId: 'failures' });
  const totals = await tickUntilQuiet(evaluator);
  assertCondition(totals.failed >= 2, `falhas contadas: ${totals.failed}`);
  expectTypedFailure(
    'histórico curto',
    await readFailure(context, shortHistory.id),
    'INSUFFICIENT_HISTORY',
  );
  expectTypedFailure('hash adulterado', await readFailure(context, tampered.id), 'HASH_MISMATCH');
  assertCondition(
    (await readProgress(context, shortHistory.id)).lastCandleTime === undefined,
    'passo gravado antes da falha',
  );
  const logged = JSON.stringify(entries);
  assertCondition(
    !logged.includes('postgres') && !logged.includes('SELECT'),
    'texto de banco no log',
  );
  reportLine(
    `falhas tipadas: histórico menor que o aquecimento (${SHORT_HISTORY} de ${LEAD_IN_CANDLES} candles) -> failed/INSUFFICIENT_HISTORY; hash adulterado -> failed/HASH_MISMATCH; ambas encerradas, sem posse e sem passo gravado`,
  );
}
