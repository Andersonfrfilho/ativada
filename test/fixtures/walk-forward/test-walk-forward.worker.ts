// Copyright (c) 2026 Ada Technology. All rights reserved.
import { serveWalkForwardWorker } from '../../../apps/api-cryptoada/src/walk-forward/serve-walk-forward-worker.js';
import { buildWalkForwardScenario } from './walk-forward-scenarios.fixture.js';

// A thread de produção (`serveWalkForwardWorker`) sobre um banco em memória: o resultado do caso de uso volta pelos
// eventos validados, igual ao da thread real.
const { memory } = buildWalkForwardScenario();

serveWalkForwardWorker({
  threads: 1,
  open: () => Promise.resolve({ database: memory.database, close: () => Promise.resolve() }),
});
