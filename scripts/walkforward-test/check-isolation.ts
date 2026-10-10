// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createRunBatchRepository,
  createRunRepository,
  createRunResultRepository,
  RUN_STATUS,
  RUN_TRANSITION_OUTCOME,
} from '../../packages/database/src/index.js';
import { STRATEGY_CONFIG } from './scenarios.js';
import {
  assertCondition,
  reportLine,
  seedStrategyVersion,
  type WalkForwardTestContext,
} from './walkforward-test-context.js';

const FIRST_PAGE = { limit: 10, after: undefined } as const;

// (g) Isolamento: B não lê as janelas, a execução, o checkpoint nem o patrimônio de A, não altera a execução dela
// e não abre lote nela; uma execução de B só enxerga as próprias janelas.
export async function checkIsolation(
  context: WalkForwardTestContext,
  completedRunId: string,
): Promise<void> {
  const { handle, owner, other } = context;
  const runs = createRunRepository(handle);
  const results = createRunResultRepository(handle);
  assertCondition(
    (await results.listWindows(other.scope, completedRunId, FIRST_PAGE)) === undefined,
    'B leu as janelas de A',
  );
  assertCondition(
    ((await results.listWindows(owner.scope, completedRunId, FIRST_PAGE))?.items.length ?? 0) > 0,
    'A não leu as próprias janelas',
  );
  assertCondition(
    (await runs.findRun(other.scope, completedRunId)) === undefined,
    'B leu a execução de A',
  );
  assertCondition(
    (await runs.readCheckpoint(other.scope, completedRunId)) === undefined,
    'B leu o checkpoint de A',
  );
  assertCondition(
    (await results.listEquityPoints(other.scope, completedRunId, FIRST_PAGE)) === undefined,
    'B leu o patrimônio de A',
  );
  const cancel = await runs.transitionRun(other.scope, {
    runId: completedRunId,
    to: RUN_STATUS.CANCELLED,
  });
  assertCondition(cancel.outcome === RUN_TRANSITION_OUTCOME.NOT_FOUND, 'B alterou a execução de A');
  const opened = await createRunBatchRepository(handle).runInBatch(
    other.scope,
    completedRunId,
    (writer) => writer.appendWindows([]),
  );
  assertCondition(opened === undefined, 'B abriu um lote na execução de A');
  const foreignVersion = await seedStrategyVersion(context, STRATEGY_CONFIG, other);
  assertCondition(foreignVersion.length > 0, 'a estratégia de B não foi criada');
  reportLine(
    'ISOLAMENTO: B não lê as janelas, a execução, o checkpoint nem o patrimônio de A, não a cancela e não abre lote nela',
  );
}
