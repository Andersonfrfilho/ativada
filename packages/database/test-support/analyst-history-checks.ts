// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createAnalystDecisionRepository } from '../src/analyst/analyst-decision.repository.js';
import { createRunBatchRepository } from '../src/run-results/run-batch.repository.js';
import { POSITION_STATUS } from '../src/run-results/run-result.constant.js';
import type { PositionInput } from '../src/run-results/run-result.types.js';
import { RUN_KIND, RUN_STATUS } from '../src/runs/run.constant.js';
import { createRunRepository } from '../src/runs/run.repository.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import {
  buildEquityPoints,
  buildPositions,
  buildSignals,
  candleTimeAt,
  resolvePersistenceOwner,
  seedRun,
} from './persistence-seed.js';

const SEEDED_CANDLES = 6;
const FAR_AWAY = 100;

function keysOf(positions: readonly { readonly engineKey: string }[]): string {
  return positions
    .map((position) => position.engineKey)
    .sort()
    .join(',');
}

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
    openedCandleTime: candleTimeAt(SEEDED_CANDLES - 1),
    closedCandleTime: undefined,
  };
}

// O que o analista lê da PRÓPRIA simulação ao retomar (spec 007, T2.3): placar e patrimônio desde a vela, as posições abertas,
// as fechadas desde ela e as 3 últimas fechadas; outro dono não lê nada.
export async function checkAnalystHistory(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-analyst-history');
  const run = await seedRun(handle, owner, { kind: RUN_KIND.LIVE_PAPER, periodEnd: undefined });
  await createRunRepository(handle).transitionRun(owner.scope, {
    runId: run.id,
    to: RUN_STATUS.RUNNING,
  });
  await createRunBatchRepository(handle).runInBatch(owner.scope, run.id, (writer) =>
    writer.appendResults({
      signals: buildSignals(SEEDED_CANDLES),
      orders: [],
      fills: [],
      positions: [...buildPositions(4), buildOpenPosition()],
      equityPoints: buildEquityPoints(SEEDED_CANDLES),
      commands: [],
    }),
  );
  const repository = createAnalystDecisionRepository(handle);
  const recent = await repository.readAnalystHistory(owner.scope, {
    runId: run.id,
    fromCandleTime: candleTimeAt(3),
  });
  assertCondition(
    recent.scores.length === 3 && recent.equities.length === 3,
    `placar e patrimônio desde a vela: ${recent.scores.length} e ${recent.equities.length}, esperado 3 e 3`,
  );
  assertCondition(
    recent.scores.every((row) => row.candleTime >= candleTimeAt(3)) &&
      recent.scores.some((row) => row.score === '0.5'),
    'o placar voltou fora da janela ou fora do formato',
  );
  assertCondition(
    keysOf(recent.positions) === 'position-0,position-1,position-2,position-3,position-open',
    `posições desde a vela: ${keysOf(recent.positions)}`,
  );
  const faraway = await repository.readAnalystHistory(owner.scope, {
    runId: run.id,
    fromCandleTime: candleTimeAt(FAR_AWAY),
  });
  assertCondition(
    faraway.scores.length === 0 && faraway.equities.length === 0,
    'placar ou patrimônio de antes da vela voltaram',
  );
  assertCondition(
    keysOf(faraway.positions) === 'position-1,position-2,position-3,position-open',
    `longe da vela vêm a aberta e as 3 últimas fechadas: ${keysOf(faraway.positions)}`,
  );
  const stranger = await resolvePersistenceOwner(handle, 'subject-analyst-history-stranger');
  const foreign = await repository.readAnalystHistory(stranger.scope, {
    runId: run.id,
    fromCandleTime: candleTimeAt(0),
  });
  assertCondition(
    foreign.scores.length === 0 && foreign.equities.length === 0 && foreign.positions.length === 0,
    'outro dono leu o histórico da execução',
  );
  reportCheck(
    'histórico do analista: placar e patrimônio desde a vela, posições abertas + fechadas desde ela + as 3 últimas fechadas; outro dono não lê nada',
  );
}
