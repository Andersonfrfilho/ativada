// Copyright (c) 2026 Ada Technology. All rights reserved.
import { serveWalkForwardWorker } from '../../../apps/api-ativada/src/walk-forward/serve-walk-forward-worker.js';
import { buildWalkForwardScenario, SCENARIO_GRID } from './walk-forward-scenarios.fixture.js';

// A linha da execução traz um pedido fora do esquema (ajuste de 0 meses): a thread falha com código estável.
const { memory } = buildWalkForwardScenario({ request: { grid: SCENARIO_GRID, trainMonths: 0 } });

serveWalkForwardWorker({
  threads: 1,
  open: () => Promise.resolve({ database: memory.database, close: () => Promise.resolve() }),
});
