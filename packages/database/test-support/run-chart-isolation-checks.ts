// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readOpenDatabase } from '../src/database-handle.js';
import { listFillsOfPositions } from '../src/run-results/run-fill-list.js';
import {
  countFillsInRange,
  listFillClusters,
  listFillMarkers,
} from '../src/run-results/run-fill-markers.js';
import { listPositions } from '../src/run-results/run-position-list.js';
import { createRunBatchRepository } from '../src/run-results/run-batch.repository.js';
import { createRunResultRepository } from '../src/run-results/run-result.repository.js';
import { readTradeTotals } from '../src/run-results/run-trade-totals.js';
import type { TimeRange } from '../src/run-results/run-result.types.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { buildChartFills } from './run-chart-checks.js';
import { candleTimeAt, resolvePersistenceOwner, seedRun } from './persistence-seed.js';

const POSITIONS_SEEDED = 30;

// Isolamento das leituras do gráfico (spec 005, T1.5): quem não é o dono recebe `undefined` pelo repositório (execução
// inexistente) E zero linhas pelas funções internas, que filtram o dono sozinhas. O `make api-runs-mutants` tira cada filtro.
export async function checkChartIsolation(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-chart-isolation');
  const stranger = await resolvePersistenceOwner(handle, 'subject-chart-isolation-other');
  const run = await seedRun(handle, owner);
  const { fills, positions } = buildChartFills();
  await createRunBatchRepository(handle).runInBatch(owner.scope, run.id, (writer) =>
    writer.appendResults({
      signals: [],
      orders: [],
      fills: fills.slice(0, POSITIONS_SEEDED * 2),
      positions: positions.slice(0, POSITIONS_SEEDED),
      equityPoints: [],
      commands: [],
    }),
  );
  const range: TimeRange = { from: candleTimeAt(0), to: candleTimeAt(2_000) };
  const { database } = readOpenDatabase(handle);
  const results = createRunResultRepository(handle);
  const keys = positions.slice(0, 5).map((position) => position.engineKey);
  const readWith = async (scope: typeof owner.scope): Promise<readonly number[]> => {
    const request = { executor: database, scope, runId: run.id };
    const totals = await readTradeTotals(request);
    return [
      (await listFillMarkers({ ...request, params: { range, limit: 500 } })).length,
      (await countFillsInRange({ ...request, params: range })).buys,
      (await listFillClusters({ ...request, params: { range, columns: 100 } })).length,
      (await listFillsOfPositions({ ...request, positionKeys: keys })).length,
      totals.closedTrades,
      (await listPositions({ ...request, params: { limit: 100, after: undefined, range } })).items
        .length,
    ];
  };
  const seen = await readWith(owner.scope);
  assertCondition(
    seen.every((count) => count > 0),
    `isolamento do gráfico: o dono deveria ver linhas em todas as leituras (${JSON.stringify(seen)})`,
  );
  const leaked = await readWith(stranger.scope);
  assertCondition(
    leaked.every((count) => count === 0),
    `isolamento do gráfico: outro dono viu linhas pelas funções internas (${JSON.stringify(leaked)})`,
  );
  const guards = [
    await results.listPriceColumns(stranger.scope, run.id, {
      exchange: 'binance',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      range,
      columns: 100,
    }),
    await results.listFillMarkers(stranger.scope, run.id, { range, limit: 10 }),
    await results.countFillsInRange(stranger.scope, run.id, range),
    await results.listFillClusters(stranger.scope, run.id, { range, columns: 100 }),
    await results.listFillsOfPositions(stranger.scope, run.id, keys),
    await results.readTradeTotals(stranger.scope, run.id),
    await results.listPositions(stranger.scope, run.id, { limit: 10, after: undefined, range }),
  ];
  assertCondition(
    guards.every((answer) => answer === undefined),
    'isolamento do gráfico: execução de outro dono não deveria existir para as sete leituras',
  );
  reportCheck(
    'gráfico: o dono lê as 6 consultas; outro usuário recebe zero linhas nas internas e undefined nas 7 do repositório',
  );
}
