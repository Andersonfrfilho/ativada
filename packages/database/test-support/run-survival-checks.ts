// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createRunBatchRepository } from '../src/run-results/run-batch.repository.js';
import type { SurvivalPointInput } from '../src/run-results/run-result.types.js';
import { createRunResultRepository } from '../src/run-results/run-result.repository.js';
import { RUN_KIND } from '../src/runs/run.constant.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { candleTimeAt, resolvePersistenceOwner, seedRun } from './persistence-seed.js';

const SERIES_LENGTH = 2_000;
const MAXIMUM_POINTS = 5;
const CENTS = 100;

// Centavos inteiros: a referência em JavaScript compara sem float, e o texto sai no formato do banco (8 casas).
type CentsPoint = { readonly candleTime: number; readonly equity: number; readonly low: number };

function toText(cents: number): string {
  return (cents / CENTS).toFixed(8);
}

// Uma série irregular e determinística, com empates no vale e no pico e um mergulho no meio.
function buildSeries(): readonly CentsPoint[] {
  return Array.from({ length: SERIES_LENGTH }, (_unused, index) => {
    const wave = ((index * 37) % 211) * 5;
    const dive = index > 900 && index < 1_000 ? 150_000 : 0;
    const equity = 1_000_000 + wave * CENTS - dive + (index % 50 === 0 ? 2_000 : 0);
    return { candleTime: candleTimeAt(index), equity, low: equity - 4_000 - (index % 4) * 500 };
  });
}

function firstWhere(
  points: readonly CentsPoint[],
  matches: (point: CentsPoint) => boolean,
): CentsPoint | undefined {
  return points.find(matches);
}

function extreme(
  points: readonly CentsPoint[],
  isBetter: (point: CentsPoint, best: CentsPoint) => boolean,
): CentsPoint | undefined {
  return points.reduce<CentsPoint | undefined>(
    (best, point) => (best === undefined || isBetter(point, best) ? point : best),
    undefined,
  );
}

// A referência independente do SQL: os cinco pontos que a varredura de sobrevivência precisa, em ordem de candle.
function expectedTimes(params: {
  readonly series: readonly CentsPoint[];
  readonly startTime: number;
  readonly floorCents: number;
  readonly targetCents: number;
}): readonly number[] {
  const counted = params.series.filter((point) => point.candleTime >= params.startTime);
  const chosen = [
    firstWhere(counted, (point) => point.low <= params.floorCents),
    firstWhere(counted, (point) => point.equity >= params.targetCents),
    extreme(counted, (point, best) => point.low < best.low),
    extreme(counted, (point, best) => point.equity > best.equity),
    counted.at(-1),
  ];
  const times = chosen.flatMap((point) => (point === undefined ? [] : [point.candleTime]));
  return [...new Set(times)].sort((left, right) => left - right);
}

function timesOf(points: readonly SurvivalPointInput[] | undefined): readonly number[] {
  return (points ?? []).map((point) => point.candleTime);
}

export async function checkSurvivalPoints(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-survival-points');
  const stranger = await resolvePersistenceOwner(handle, 'subject-survival-points-other');
  const run = await seedRun(handle, owner, { kind: RUN_KIND.LIVE_PAPER });
  const series = buildSeries();
  await createRunBatchRepository(handle).runInBatch(owner.scope, run.id, (writer) =>
    writer.appendResults({
      signals: [],
      orders: [],
      fills: [],
      positions: [],
      commands: [],
      equityPoints: series.map((point) => ({
        candleTime: point.candleTime,
        equity: toText(point.equity),
        equityAtLow: toText(point.low),
        benchmark: toText(1_000_000),
      })),
    }),
  );
  const results = createRunResultRepository(handle);
  const cases = [
    {
      name: 'piso e meta no meio da série',
      startTime: candleTimeAt(0),
      floor: 996_000,
      target: 1_100_000,
    },
    {
      name: 'aquecimento antes do início não conta',
      startTime: candleTimeAt(1_200),
      floor: 996_000,
      target: 1_100_000,
    },
    { name: 'nenhum dos dois atingido', startTime: candleTimeAt(0), floor: 1, target: 99_999_999 },
    {
      name: 'o empate no nível conta (<= piso, >= meta)',
      startTime: candleTimeAt(0),
      floor: series[10]?.low ?? 0,
      target: series[20]?.equity ?? 0,
    },
    {
      name: 'início depois do último ponto',
      startTime: candleTimeAt(SERIES_LENGTH + 5),
      floor: 996_000,
      target: 1_100_000,
    },
  ];
  for (const item of cases) {
    const found = await results.listSurvivalPoints(owner.scope, run.id, {
      startTime: item.startTime,
      floorLevel: toText(item.floor),
      targetLevel: toText(item.target),
    });
    const expected = expectedTimes({
      series,
      startTime: item.startTime,
      floorCents: item.floor,
      targetCents: item.target,
    });
    assertCondition(
      JSON.stringify(timesOf(found)) === JSON.stringify(expected),
      `sobrevivência (${item.name}): esperado ${expected.length} pontos ${JSON.stringify(expected)}, obtido ${JSON.stringify(timesOf(found))}`,
    );
    assertCondition(
      (found?.length ?? 0) <= MAXIMUM_POINTS,
      `sobrevivência (${item.name}): leu ${found?.length} linhas de ${SERIES_LENGTH}`,
    );
  }
  const args = { startTime: candleTimeAt(0), floorLevel: '1', targetLevel: '2' };
  assertCondition(
    (await results.listSurvivalPoints(stranger.scope, run.id, args)) === undefined,
    'outro dono não lê a curva',
  );
  assertCondition(
    (await results.listSurvivalPoints(owner.scope, crypto.randomUUID(), args)) === undefined,
    'execução inexistente',
  );
  reportCheck(
    `sobrevivência do saldo: ${cases.length} casos sobre ${SERIES_LENGTH} pontos leem no máximo ${MAXIMUM_POINTS} linhas e escolhem os mesmos pontos da referência; outro dono não lê`,
  );
}
