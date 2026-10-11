// Copyright (c) 2026 Ada Technology. All rights reserved.
import { closeDatabase, openDatabase } from '@cryptoada/database';

import { loadWalkForwardWorkerEnvironment } from '../environment.js';
import { createWalkForwardDatabase } from './create-walk-forward-database.js';
import { serveWalkForwardWorker } from './serve-walk-forward-worker.js';

const environment = loadWalkForwardWorkerEnvironment();

serveWalkForwardWorker({
  threads: environment.WALK_FORWARD_THREADS,
  open: () => {
    const handle = openDatabase(environment.DATABASE_URL, {
      sslRootCertificate: environment.DATABASE_SSL_ROOT_CERT,
    });
    return Promise.resolve({
      database: createWalkForwardDatabase(handle),
      close: () => closeDatabase(handle),
    });
  },
});
