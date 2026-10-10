// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parentPort } from 'node:worker_threads';

import { closeDatabase, openDatabase } from '../../packages/database/src/index.js';
import { createBacktestDatabase } from '../../apps/api-cryptoada/src/backtest/create-backtest-database.js';
import { runBacktest } from '../../apps/api-cryptoada/src/backtest/run-backtest.js';
import { BACKTEST_REQUEST_SCHEMA } from '../../apps/api-cryptoada/src/backtest/backtest-messages.js';

// A thread de produção com um defeito no meio da execução, escolhido por `CRASH_MODE`: morre (exit), lança fora
// de qualquer captura (throw) ou trava de vez (hang) DEPOIS de o primeiro lote já ter sido gravado.
const MODE = Bun.env.CRASH_MODE ?? 'exit';
const DATABASE_URL = Bun.env.DATABASE_URL ?? '';
const CRASH_AT_PROGRESS = 20;
const EXIT_CODE = 9;

function misbehave(): void {
  if (MODE === 'exit') process.exit(EXIT_CODE);
  if (MODE === 'throw') {
    setTimeout(() => {
      throw new Error('boom');
    }, 0);
    return;
  }
  for (;;) {
    // ocupa a thread para sempre
  }
}

const port = parentPort;
if (port === null) throw new Error('fora de uma thread');
port.on('message', (data: unknown) => {
  const { runId } = BACKTEST_REQUEST_SCHEMA.parse(data);
  const handle = openDatabase(DATABASE_URL);
  void runBacktest({
    database: createBacktestDatabase(handle),
    runId,
    options: {
      onProgress: (progress) => {
        if (progress >= CRASH_AT_PROGRESS) misbehave();
      },
    },
  }).finally(() => closeDatabase(handle));
});
port.postMessage({ type: 'ready' });
