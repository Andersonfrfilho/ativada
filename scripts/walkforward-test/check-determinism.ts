// Copyright (c) 2026 Ada Technology. All rights reserved.
import { GRID_24, hourlyScenario, NO_COSTS } from './scenarios.js';
import { assertCompleted, runScenario, type ScenarioResult } from './run-scenario.js';
import { SYMBOLS } from './walkforward-test.constant.js';
import {
  assertCondition,
  reportLine,
  type Scenario,
  type WalkForwardTestContext,
} from './walkforward-test-context.js';

const REQUEST = { grid: GRID_24, minTradesPerWindow: 10 } as const;

function scenarioOf(versionId: string): Scenario {
  return hourlyScenario({
    versionId,
    symbol: SYMBOLS.OVERFITTING,
    request: REQUEST,
    costs: NO_COSTS,
  });
}

// (d) Duas execuções dão o mesmo digest, e 1 thread × 4 threads dão o mesmo digest que as 2 da referência: o
// resultado não depende do número de threads de busca.
export async function checkDeterminism(
  context: WalkForwardTestContext,
  versionId: string,
  reference: ScenarioResult,
): Promise<void> {
  const again = await runScenario(context, scenarioOf(versionId), { threads: 2 });
  assertCompleted(again, 'segunda execução');
  assertCondition(
    again.persisted.digest === reference.persisted.digest,
    'DETERMINISMO: duas execuções deram resultados diferentes',
  );
  const one = await runScenario(context, scenarioOf(versionId), { threads: 1 });
  const four = await runScenario(context, scenarioOf(versionId), { threads: 4 });
  assertCompleted(one, '1 thread');
  assertCompleted(four, '4 threads');
  assertCondition(
    one.persisted.digest === four.persisted.digest &&
      one.persisted.digest === reference.persisted.digest,
    `THREADS: 1 thread (${one.persisted.digest}) × 4 threads (${four.persisted.digest}) × 2 threads (${reference.persisted.digest})`,
  );
  reportLine(
    `DETERMINISMO: duas execuções e 1 × 2 × 4 threads dão o mesmo digest ${reference.persisted.digest} (janelas, sinais, ordens, preenchimentos, posições, patrimônio e métricas); tempo ${one.wallMilliseconds.toFixed(0)} ms com 1 thread, ${reference.wallMilliseconds.toFixed(0)} ms com 2, ${four.wallMilliseconds.toFixed(0)} ms com 4`,
  );
}
