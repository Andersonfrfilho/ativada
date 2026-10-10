// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ALERT_CHANNEL, ALERT_SIDE } from '../src/alerts/alert.constant.js';
import { readOpenDatabase, type DatabaseHandle } from '../src/database-handle.js';
import { toJsonb } from '../src/jsonb.js';
import { alerts } from '../src/schema/alerts.schema.js';
import { createAccountExportRepository } from '../src/account/account-export.repository.js';
import { RUN_KIND, RUN_STATUS } from '../src/runs/run.constant.js';
import { createRunRepository } from '../src/runs/run.repository.js';
import { createRunResultRepository } from '../src/run-results/run-result.repository.js';
import { createStrategyRepository } from '../src/strategies/strategy.repository.js';
import type {
  LifecycleCheckContext,
  LifecycleOwner,
  LifecycleOwners,
} from './account-lifecycle-checks.js';
import {
  buildCommands,
  buildEquityPoints,
  buildFills,
  buildOrders,
  buildPositions,
  buildRunParams,
  buildSignals,
  buildWindows,
  hashOf,
} from './persistence-seed.js';

// O pedido do walk-forward é dado do usuário: entra na exportação e some com a exclusão da conta.
export const SEEDED_REQUEST = {
  grid: { parameters: [{ path: 'thresholds.buy', values: ['1', '1.5'] }] },
  trainMonths: 6,
} as const;

export const PERSISTENCE_TABLES = [
  'strategies',
  'strategy_versions',
  'runs',
  'signals',
  'orders',
  'fills',
  'positions',
  'equity_points',
  'run_commands',
  'walk_forward_windows',
  'alerts',
] as const;
const ENGINE_STATE_MARKER = 'engine-state-marker';
const ALERT_REASON_MARKER = 'alert-reason-marker';
export const PERSISTENCE_EXPECTED_ROWS: Readonly<
  Record<(typeof PERSISTENCE_TABLES)[number], number>
> = {
  strategies: 1,
  strategy_versions: 1,
  runs: 1,
  signals: 3,
  orders: 2,
  fills: 2,
  positions: 1,
  equity_points: 3,
  run_commands: 1,
  walk_forward_windows: 2,
  alerts: 1,
};

export function strategyNameOf(owner: LifecycleOwner): string {
  return `Estratégia do dono ${owner.userId.slice(-12)}`;
}

export async function seedOwnerPersistence(
  handle: DatabaseHandle,
  owner: LifecycleOwner,
): Promise<void> {
  const strategies = createStrategyRepository(handle);
  const strategy = await strategies.createStrategy(owner.scope, {
    name: strategyNameOf(owner),
    isExample: false,
  });
  const config = { schemaVersion: 1, label: strategyNameOf(owner) };
  const added = await strategies.addVersion(owner.scope, {
    strategyId: strategy.id,
    config,
    configHash: hashOf(JSON.stringify(config)),
  });
  const runs = createRunRepository(handle);
  const run = await runs.createRun(
    owner.scope,
    buildRunParams(added?.version.id ?? '', {
      kind: RUN_KIND.WALK_FORWARD,
      request: SEEDED_REQUEST,
    }),
  );
  if (run === undefined) throw new Error('execução do ciclo de vida não criada');
  await runs.transitionRun(owner.scope, { runId: run.id, to: RUN_STATUS.RUNNING });
  await runs.saveCheckpoint(owner.scope, {
    runId: run.id,
    engineState: { marker: ENGINE_STATE_MARKER },
    lastCandleTime: 10,
    progress: 50,
  });
  const results = createRunResultRepository(handle);
  await results.appendSignals(owner.scope, run.id, buildSignals(3));
  await results.appendOrders(owner.scope, run.id, buildOrders(2));
  await results.appendFills(owner.scope, run.id, buildFills(2));
  await results.appendPositions(owner.scope, run.id, buildPositions(1));
  await results.appendEquityPoints(owner.scope, run.id, buildEquityPoints(3));
  await results.appendCommands(owner.scope, run.id, buildCommands(1));
  await results.appendWindows(owner.scope, run.id, buildWindows(2));
  await seedAlert(handle, owner, run.id);
}

// Direto na tabela: o alerta é dado do dono (texto do motivo), e a semente não depende do vínculo do Telegram.
async function seedAlert(
  handle: DatabaseHandle,
  owner: LifecycleOwner,
  runId: string,
): Promise<void> {
  await readOpenDatabase(handle)
    .database.insert(alerts)
    .values({
      id: Bun.randomUUIDv7(),
      userId: owner.userId,
      runId,
      candleTime: 1,
      side: ALERT_SIDE.BUY,
      channel: ALERT_CHANNEL.TELEGRAM,
      payload: toJsonb({ reason: ALERT_REASON_MARKER }),
    });
}

export async function seedPersistenceOwners(
  context: LifecycleCheckContext,
  owners: LifecycleOwners,
): Promise<void> {
  await seedOwnerPersistence(context.handle, owners.ownerA);
  await seedOwnerPersistence(context.handle, owners.ownerB);
}

async function countRows(client: Bun.SQL, table: string, userId: string): Promise<number> {
  const rows: unknown = await client.unsafe(
    `SELECT count(*)::int AS total FROM ${table} WHERE user_id = $1`,
    [userId],
  );
  return (rows as readonly { total: number }[])[0]?.total ?? 0;
}

export async function checkPersistenceExport(
  context: LifecycleCheckContext,
  owners: LifecycleOwners,
): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const exports = createAccountExportRepository(handle);
  const data = await exports.exportOwnerData(owners.ownerA.scope);
  if (data === undefined) throw new Error('exportação de A vazia');
  for (const table of PERSISTENCE_TABLES) {
    const count = data.tables[table]?.length ?? -1;
    assertCondition(
      count === PERSISTENCE_EXPECTED_ROWS[table],
      `exportação de ${table}: ${count} linhas`,
    );
  }
  const text = JSON.stringify(data);
  assertCondition(text.includes(strategyNameOf(owners.ownerA)), 'estratégia de A na exportação');
  assertCondition(text.includes(ALERT_REASON_MARKER), 'o alerta de A está na exportação');
  for (const foreign of [strategyNameOf(owners.ownerB), owners.ownerB.userId]) {
    assertCondition(!text.includes(foreign), `a exportação de A vazou ${foreign}`);
  }
  for (const internal of [
    ENGINE_STATE_MARKER,
    'engineState',
    'engine_state',
    'configHash',
    'runHash',
    'user_id',
  ]) {
    assertCondition(!text.includes(internal), `a exportação carregou dado interno: ${internal}`);
  }
  reportCheck(
    'exportação: estratégias, execuções e resultados só de A, sem estado do motor nem hashes',
  );
}

export async function checkPersistencePurge(
  context: LifecycleCheckContext,
  owners: LifecycleOwners,
): Promise<void> {
  const { client, assertCondition, reportCheck } = context;
  for (const table of PERSISTENCE_TABLES) {
    const ofA = await countRows(client, table, owners.ownerA.userId);
    const ofB = await countRows(client, table, owners.ownerB.userId);
    assertCondition(ofA === 0, `${table}: restaram ${ofA} linhas de A depois da purga`);
    assertCondition(
      ofB === PERSISTENCE_EXPECTED_ROWS[table],
      `${table}: B tem ${ofB} linhas (esperado ${PERSISTENCE_EXPECTED_ROWS[table]})`,
    );
  }
  reportCheck(
    'purga: as 11 tabelas de estratégia/execução/resultado/alerta de A vazias, as de B intactas',
  );
}
