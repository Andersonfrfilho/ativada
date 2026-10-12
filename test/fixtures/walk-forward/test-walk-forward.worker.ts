// Copyright (c) 2026 Ada Technology. All rights reserved.
import { serveWalkForwardWorker } from '../../../apps/api-ativada/src/walk-forward/serve-walk-forward-worker.js';
import { buildWalkForwardScenario, SCENARIO_OPTIONS } from './walk-forward-scenarios.fixture.js';

// A thread de produção (`serveWalkForwardWorker`) sobre um banco em memória: o resultado do caso de uso volta pelos
// eventos validados, igual ao da thread real.
// O pedido mora na linha da execução (`runs.request`): a mensagem da thread leva só o `runId`.
const { memory } = buildWalkForwardScenario({ request: SCENARIO_OPTIONS });

serveWalkForwardWorker({
  threads: 1,
  open: () => Promise.resolve({ database: memory.database, close: () => Promise.resolve() }),
});
