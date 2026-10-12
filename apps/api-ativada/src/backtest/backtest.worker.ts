// Copyright (c) 2026 Ada Technology. All rights reserved.
import { closeDatabase, openDatabase } from '@ativada/database';

import { loadBacktestWorkerEnvironment } from '../environment.js';
import { createBacktestDatabase } from './create-backtest-database.js';
import { serveBacktestWorker } from './serve-backtest-worker.js';

serveBacktestWorker({
  open: () => {
    const environment = loadBacktestWorkerEnvironment();
    const handle = openDatabase(environment.DATABASE_URL, {
      sslRootCertificate: environment.DATABASE_SSL_ROOT_CERT,
    });
    return Promise.resolve({
      database: createBacktestDatabase(handle),
      close: () => closeDatabase(handle),
    });
  },
});
