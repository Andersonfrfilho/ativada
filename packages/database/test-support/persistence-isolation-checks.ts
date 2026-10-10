// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  ACCESS_OUTCOME,
  expectOtherUserGetsNotFound,
  type AccessOutcome,
  type CrossOwnerContract,
  type ListedResource,
} from '../../../test/fixtures/cross-owner-access.fixture.js';
import type { OwnerScope } from '../src/ownership/owner-scope.js';
import { RUN_STATUS, RUN_TRANSITION_OUTCOME } from '../src/runs/run.constant.js';
import { createRunRepository } from '../src/runs/run.repository.js';
import { readOpenDatabase } from '../src/database-handle.js';
import { createRunResultRepository } from '../src/run-results/run-result.repository.js';
import {
  listEquityPoints,
  listFills,
  listOrders,
  listPositions,
  listSignals,
} from '../src/run-results/run-result-list.js';
import { createStrategyRepository } from '../src/strategies/strategy.repository.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
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
  resolvePersistenceOwner,
  seedRun,
  seedStrategyVersion,
  type PersistenceOwner,
} from './persistence-seed.js';

const RESULT_TABLES = [
  'signals',
  'orders',
  'fills',
  'positions',
  'equity_points',
  'run_commands',
  'walk_forward_windows',
];
const FIRST_PAGE = { limit: 10, after: undefined } as const;

function outcomeOf(isGranted: boolean): AccessOutcome {
  return isGranted ? ACCESS_OUTCOME.GRANTED : ACCESS_OUTCOME.NOT_FOUND;
}

type Owners = { readonly first: PersistenceOwner; readonly second: PersistenceOwner };

function ownerOf(owners: Owners, scope: OwnerScope): PersistenceOwner {
  return scope === owners.first.scope ? owners.first : owners.second;
}

function buildStrategyContract(context: LifecycleCheckContext, owners: Owners): CrossOwnerContract {
  const strategies = createStrategyRepository(context.handle);
  return {
    ownerScope: owners.first.scope,
    otherUserScope: owners.second.scope,
    createResource: async (scope) =>
      (await strategies.createStrategy(scope, { name: 'Isolada', isExample: false })).id,
    readResource: async (scope, strategyId): Promise<unknown> => {
      const strategy = await strategies.findStrategy(scope, strategyId);
      if (strategy === undefined) return undefined;
      return { strategy, versions: await strategies.listVersions(scope, strategyId) };
    },
    listResources: (scope) => strategies.listStrategies(scope),
    attempts: {
      read: async (scope, strategyId) =>
        outcomeOf((await strategies.findStrategy(scope, strategyId)) !== undefined),
      listVersions: async (scope, strategyId) =>
        outcomeOf((await strategies.listVersions(scope, strategyId)) !== undefined),
      addVersion: async (scope, strategyId) =>
        outcomeOf(
          (await strategies.addVersion(scope, {
            strategyId,
            config: { nonce: strategyId },
            configHash: hashOf(`attempt-${strategyId}`),
          })) !== undefined,
        ),
      softDelete: async (scope, strategyId) =>
        outcomeOf(await strategies.softDeleteStrategy(scope, strategyId)),
    },
  };
}

function buildVersionContract(context: LifecycleCheckContext, owners: Owners): CrossOwnerContract {
  const { handle } = context;
  const strategies = createStrategyRepository(handle);
  return {
    ownerScope: owners.first.scope,
    otherUserScope: owners.second.scope,
    createResource: async (scope) => (await seedStrategyVersion(handle, ownerOf(owners, scope))).id,
    readResource: (scope, versionId) => strategies.findVersion(scope, versionId),
    listResources: async (scope): Promise<readonly ListedResource[]> => {
      const listed = await strategies.listStrategies(scope);
      const versions = await Promise.all(
        listed.map((strategy) => strategies.listVersions(scope, strategy.id)),
      );
      return versions.flatMap((entry) => entry ?? []);
    },
    attempts: {
      read: async (scope, versionId) =>
        outcomeOf((await strategies.findVersion(scope, versionId)) !== undefined),
      startRun: async (scope, versionId) =>
        outcomeOf(
          (await createRunRepository(handle).createRun(scope, buildRunParams(versionId))) !==
            undefined,
        ),
    },
  };
}

async function countResultRows(client: Bun.SQL, runId: string): Promise<readonly number[]> {
  const counts = RESULT_TABLES.map(async (table) => {
    const rows: unknown = await client.unsafe(
      `SELECT count(*)::int AS total FROM ${table} WHERE run_id = $1`,
      [runId],
    );
    return (rows as readonly { total: number }[])[0]?.total ?? 0;
  });
  return Promise.all(counts);
}

function buildRunContract(context: LifecycleCheckContext, owners: Owners): CrossOwnerContract {
  const { handle, client } = context;
  const runs = createRunRepository(handle);
  const results = createRunResultRepository(handle);
  const writes: Readonly<Record<string, (scope: OwnerScope, runId: string) => Promise<unknown>>> = {
    appendSignals: (scope, runId) => results.appendSignals(scope, runId, buildSignals(1)),
    appendOrders: (scope, runId) => results.appendOrders(scope, runId, buildOrders(1)),
    appendFills: (scope, runId) => results.appendFills(scope, runId, buildFills(1)),
    appendPositions: (scope, runId) => results.appendPositions(scope, runId, buildPositions(1)),
    appendEquityPoints: (scope, runId) =>
      results.appendEquityPoints(scope, runId, buildEquityPoints(1)),
    appendCommands: (scope, runId) => results.appendCommands(scope, runId, buildCommands(1)),
    appendWindows: (scope, runId) => results.appendWindows(scope, runId, buildWindows(1)),
    listSignals: (scope, runId) => results.listSignals(scope, runId, FIRST_PAGE),
    listOrders: (scope, runId) => results.listOrders(scope, runId, FIRST_PAGE),
    listFills: (scope, runId) => results.listFills(scope, runId, FIRST_PAGE),
    listPositions: (scope, runId) => results.listPositions(scope, runId, FIRST_PAGE),
    listEquityPoints: (scope, runId) => results.listEquityPoints(scope, runId, FIRST_PAGE),
    listWindows: (scope, runId) => results.listWindows(scope, runId, FIRST_PAGE),
    readCheckpoint: (scope, runId) => runs.readCheckpoint(scope, runId),
    findRun: (scope, runId) => runs.findRun(scope, runId),
  };
  const attempts: Record<string, (scope: OwnerScope, runId: string) => Promise<AccessOutcome>> = {
    transition: async (scope, runId): Promise<AccessOutcome> => {
      const result = await runs.transitionRun(scope, { runId, to: RUN_STATUS.CANCELLED });
      if (result.outcome === RUN_TRANSITION_OUTCOME.INVALID_TRANSITION) {
        throw new Error('transição inválida revelaria o estado de uma execução alheia');
      }
      return outcomeOf(result.outcome === RUN_TRANSITION_OUTCOME.TRANSITIONED);
    },
    saveCheckpoint: async (scope, runId) =>
      outcomeOf(
        await runs.saveCheckpoint(scope, {
          runId,
          engineState: { a: 1 },
          lastCandleTime: 5,
          progress: 5,
        }),
      ),
  };
  for (const [name, write] of Object.entries(writes)) {
    attempts[name] = async (scope, runId): Promise<AccessOutcome> =>
      outcomeOf((await write(scope, runId)) !== undefined);
  }
  return {
    ownerScope: owners.first.scope,
    otherUserScope: owners.second.scope,
    createResource: async (scope): Promise<string> => {
      const run = await seedRun(handle, ownerOf(owners, scope));
      await runs.transitionRun(scope, { runId: run.id, to: RUN_STATUS.RUNNING });
      return run.id;
    },
    readResource: async (scope, runId): Promise<unknown> => {
      const run = await runs.findRun(scope, runId);
      if (run === undefined) return undefined;
      return {
        run,
        checkpoint: await runs.readCheckpoint(scope, runId),
        rows: await countResultRows(client, runId),
      };
    },
    listResources: async (scope) =>
      (await runs.listRuns(scope, { limit: 100, after: undefined, kind: undefined })).runs,
    attempts,
  };
}

async function checkNotFoundIsIndistinguishable(
  context: LifecycleCheckContext,
  owners: Owners,
): Promise<void> {
  const { handle, assertCondition } = context;
  const runs = createRunRepository(handle);
  const alien = await seedRun(handle, owners.first);
  await runs.transitionRun(owners.first.scope, { runId: alien.id, to: RUN_STATUS.RUNNING });
  const scope = owners.second.scope;
  const checkpoint = { engineState: { a: 1 }, lastCandleTime: 5, progress: 5 };
  const probes: readonly (readonly [string, (runId: string) => Promise<unknown>])[] = [
    [
      'transição',
      (runId): Promise<unknown> => runs.transitionRun(scope, { runId, to: RUN_STATUS.FAILED }),
    ],
    [
      'checkpoint',
      (runId): Promise<unknown> => runs.saveCheckpoint(scope, { runId, ...checkpoint }),
    ],
    ['leitura', (runId): Promise<unknown> => runs.findRun(scope, runId)],
    ['leitura do checkpoint', (runId): Promise<unknown> => runs.readCheckpoint(scope, runId)],
    [
      'sinais',
      (runId): Promise<unknown> =>
        createRunResultRepository(handle).listSignals(scope, runId, FIRST_PAGE),
    ],
  ];
  for (const [label, probe] of probes) {
    const ofAlien = JSON.stringify(await probe(alien.id));
    const ofUnknown = JSON.stringify(await probe(crypto.randomUUID()));
    assertCondition(
      ofAlien === ofUnknown,
      `${label}: execução alheia responde diferente da inexistente`,
    );
  }
}

// A camada de dentro (o filtro `user_id` da própria consulta) vale sozinha, sem a conferência da execução.
async function checkInnerOwnerFilters(
  context: LifecycleCheckContext,
  owners: Owners,
): Promise<void> {
  const { handle, assertCondition } = context;
  const { database } = readOpenDatabase(handle);
  const run = await seedRun(handle, owners.first);
  const results = createRunResultRepository(handle);
  const scope = owners.first.scope;
  await results.appendSignals(scope, run.id, buildSignals(1));
  await results.appendOrders(scope, run.id, buildOrders(1));
  await results.appendFills(scope, run.id, buildFills(1));
  await results.appendPositions(scope, run.id, buildPositions(1));
  await results.appendEquityPoints(scope, run.id, buildEquityPoints(1));
  const countFor = async (viewer: OwnerScope): Promise<readonly number[]> => {
    const request = { executor: database, scope: viewer, runId: run.id, params: FIRST_PAGE };
    const pages = [
      await listSignals(request),
      await listOrders(request),
      await listFills(request),
      await listPositions(request),
      await listEquityPoints(request),
    ];
    return pages.map((page) => page.items.length);
  };
  assertCondition((await countFor(scope)).join() === '1,1,1,1,1', 'o dono lê as cinco listas');
  assertCondition(
    (await countFor(owners.second.scope)).join() === '0,0,0,0,0',
    'o filtro de dono de cada consulta vale sem a conferência da execução',
  );
}

export async function checkPersistenceIsolation(context: LifecycleCheckContext): Promise<void> {
  const { handle, reportCheck } = context;
  const owners: Owners = {
    first: await resolvePersistenceOwner(handle, 'subject-isolation-a'),
    second: await resolvePersistenceOwner(handle, 'subject-isolation-b'),
  };
  await expectOtherUserGetsNotFound(buildStrategyContract(context, owners));
  await expectOtherUserGetsNotFound(buildVersionContract(context, owners));
  await expectOtherUserGetsNotFound(buildRunContract(context, owners));
  await checkNotFoundIsIndistinguishable(context, owners);
  await checkInnerOwnerFilters(context, owners);
  reportCheck(
    'isolamento: B não lê, lista, altera nem grava resultado em estratégia, versão e execução de A; não-encontrado igual ao inexistente; filtro de dono de cada consulta vale sozinho',
  );
}
