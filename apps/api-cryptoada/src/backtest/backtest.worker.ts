// Copyright (c) 2026 Ada Technology. All rights reserved.
import { closeDatabase, openDatabase } from '@cryptoada/database';

import { loadBacktestWorkerEnvironment } from '../environment.js';
import { createBacktestDatabase } from './create-backtest-database.js';
import { serveBacktestWorker } from './serve-backtest-worker.js';

serveBacktestWorker({
  open: () => {
    const handle = openDatabase(loadBacktestWorkerEnvironment().DATABASE_URL);
    return Promise.resolve({
      database: createBacktestDatabase(handle),
      close: () => closeDatabase(handle),
    });
  },
});
