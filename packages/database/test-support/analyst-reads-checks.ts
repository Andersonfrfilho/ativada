// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createAnalystDecisionRepository } from '../src/analyst/analyst-decision.repository.js';
import { createRunBatchRepository } from '../src/run-results/run-batch.repository.js';
import { POSITION_STATUS } from '../src/run-results/run-result.constant.js';
import type { PositionInput } from '../src/run-results/run-result.types.js';
import { RUN_KIND, RUN_STATUS } from '../src/runs/run.constant.js';
import { createRunRepository } from '../src/runs/run.repository.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { buildAnalystDecisionInput } from './analyst-decision-checks.js';
import {
  buildEquityPoints,
  buildPositions,
  candleTimeAt,
  resolvePersistenceOwner,
  seedRun,
} from './persistence-seed.js';

const DECISIONS = 4;
const EQUITY_POINTS = 3;

function buildOpenPosition(): PositionInput {
  return {
    ...buildPositions(1)[0],
    engineKey: 'position-open',
    status: POSITION_STATUS.OPEN,
    entryPrice: '30000.00000000',
    quantity: '0.01500000',
    stopPrice: '29000.00000000',
    targetPrice: '31000.00000000',
    entryFee: '0.45000000',
    exitPrice: undefined,
    exitFee: undefined,
    netProfit: undefined,
    exitReason: undefined,
    openedCandleTime: candleTimeAt(0),
    closedCandleTime: undefined,
  };
}

// Isolamento das leituras do analista de risco que as rotas REST usam (spec 007, T3.1): a última decisão, a página
// decrescente e o patrimônio com as operações fechadas filtram o dono nelas mesmas. O `make api-runs-mutants` tira cada filtro.
export async function checkAnalystReads(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-analyst-reads');
  const stranger = await resolvePersistenceOwner(handle, 'subject-analyst-reads-other');
  const run = await seedRun(handle, owner, { kind: RUN_KIND.LIVE_PAPER, periodEnd: undefined });
  await createRunRepository(handle).transitionRun(owner.scope, {
    runId: run.id,
    to: RUN_STATUS.RUNNING,
  });
  await createRunBatchRepository(handle).runInBatch(owner.scope, run.id, (writer) =>
    writer.appendResults({
      signals: [],
      orders: [],
      fills: [],
      positions: [...buildPositions(2), buildOpenPosition()],
      equityPoints: buildEquityPoints(EQUITY_POINTS),
      commands: [],
    }),
  );
  const repository = createAnalystDecisionRepository(handle);
  for (let index = 0; index < DECISIONS; index += 1) {
    await repository.appendAnalystDecision(
      owner.scope,
      buildAnalystDecisionInput(run.id, candleTimeAt(index)),
    );
  }
  const latest = await repository.findLatestAnalystDecision(owner.scope, run.id);
  assertCondition(
    latest?.candleTime === candleTimeAt(DECISIONS - 1),
    `a última decisão do dono é a mais nova: ${latest?.candleTime}`,
  );
  const page = await repository.listAnalystDecisionsPage(owner.scope, {
    runId: run.id,
    limit: DECISIONS,
    before: undefined,
  });
  assertCondition(page.decisions.length === DECISIONS, 'o dono lê as decisões da própria execução');
  const snapshot = await repository.readAnalystGoalSnapshot(owner.scope, run.id);
  assertCondition(
    snapshot.latestEquity !== undefined && snapshot.closedPositions === 2,
    `o dono lê o patrimônio e as 2 operações fechadas: ${snapshot.closedPositions}`,
  );
  assertCondition(
    (await repository.findLatestAnalystDecision(stranger.scope, run.id)) === undefined,
    'outro dono leu a última decisão do analista',
  );
  const foreignPage = await repository.listAnalystDecisionsPage(stranger.scope, {
    runId: run.id,
    limit: DECISIONS,
    before: undefined,
  });
  assertCondition(foreignPage.decisions.length === 0, 'outro dono leu a página de decisões');
  const foreignSnapshot = await repository.readAnalystGoalSnapshot(stranger.scope, run.id);
  assertCondition(
    foreignSnapshot.latestEquity === undefined && foreignSnapshot.closedPositions === 0,
    'outro dono leu o patrimônio ou as operações fechadas',
  );
  reportCheck('analista: última decisão, página e meta somada presas ao dono');
}
