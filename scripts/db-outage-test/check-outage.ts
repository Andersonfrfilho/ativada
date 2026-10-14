// Copyright (c) 2026 Ada Technology. All rights reserved.
import { OUTAGE_PROXY_MODE } from '../../packages/database/test-support/outage-proxy.js';
import { readPersistedRun } from '../backtest-test/read-run-rows.js';
import {
  cancelRun,
  createLiveRun,
  createProductionEvaluator,
  digestOf,
  errorsOf,
  readProgress,
  seedCandles,
  tickUntilQuiet,
  type LiveTestContext,
} from '../live-test/live-test-context.js';
import { buildCandlePlan, type CandlePlan } from './candle-plan.js';
import {
  CANDLES_BEFORE_OUTAGE,
  MARKET_TIMEFRAME,
  OUTAGE_MILLISECONDS,
  RECOVERY_LIMIT_MILLISECONDS,
} from './db-outage-test.constant.js';
import {
  assertCondition,
  readAdminSnapshot,
  readPublicHealth,
  reportLine,
  waitUntil,
  type OutageSite,
} from './db-outage-context.js';
import { auditWorkerLog } from './audit-worker-log.js';

export const OUTAGE_KIND = { KILL: 'kill', HALF_OPEN: 'half-open' } as const;
export type OutageKind = (typeof OUTAGE_KIND)[keyof typeof OUTAGE_KIND];

const DEGRADED_BODY = '{"data":{"status":"degraded"}}';
const HEALTH_SAMPLE_MILLISECONDS = 500;
const USER_ROUTE_DELAY_MILLISECONDS = 8_000;
const USER_ROUTE_SUBJECT = 'subject-outage-user';

type Journey = {
  readonly site: OutageSite;
  readonly symbol: string;
  readonly plan: CandlePlan;
  readonly runId: string;
  readonly finalCandleTime: number;
};

async function createRun(
  context: LiveTestContext,
  params: { readonly symbol: string; readonly startsAt: number },
): Promise<string> {
  const run = await createLiveRun(context, {
    symbol: params.symbol,
    timeframe: MARKET_TIMEFRAME,
    periodStart: params.startsAt,
  });
  return run.id;
}

// A execução contínua: as mesmas velas, a mesma simulação, num banco que nada derruba e avaliada de uma vez.
async function runContinuousReference(
  site: OutageSite,
  params: { readonly symbol: string; readonly plan: CandlePlan },
): Promise<string> {
  const { reference } = site;
  const { symbol, plan } = params;
  await seedCandles(reference, [...plan.warmUp, ...plan.arriving], { symbol, allowFuture: true });
  const runId = await createRun(reference, { symbol, startsAt: plan.startsAt });
  const evaluation = createProductionEvaluator(reference, { instanceId: `reference-${symbol}` });
  await tickUntilQuiet(evaluation.evaluator);
  assertCondition(errorsOf(evaluation.entries).length === 0, 'a execução contínua deu erro');
  await cancelRun(reference, { runId });
  return runId;
}

async function startSubject(site: OutageSite, symbol: string, plan: CandlePlan): Promise<Journey> {
  const { subject } = site;
  const early = plan.arriving.slice(0, CANDLES_BEFORE_OUTAGE);
  await seedCandles(subject, [...plan.warmUp, ...early], { symbol, allowFuture: true });
  const runId = await createRun(subject, { symbol, startsAt: plan.startsAt });
  const lastEarly = early.at(-1)?.openTime ?? 0;
  const finalCandleTime = plan.arriving.at(-1)?.openTime ?? 0;
  await waitUntil(
    'o worker real avançar a simulação até a última vela antes da queda',
    async () => (await readProgress(subject, runId)).lastCandleTime === lastEarly,
  );
  return { site, symbol, plan, runId, finalCandleTime };
}

// O `kill` do banco visto pelos clientes: todas as conexões caem e as novas são recusadas. A meia conexão é a do computador
// que dorme: as conexões abertas e as novas ficam mudas sem fechar, e as antigas nunca mais voltam.
function cutDatabase(site: OutageSite, kind: OutageKind): void {
  site.proxy.setMode(kind === OUTAGE_KIND.KILL ? OUTAGE_PROXY_MODE.REFUSE : OUTAGE_PROXY_MODE.MUTE);
}

type OutageObservations = { readonly healthStatuses: number[]; readonly userRouteStatus: number };

async function observeDuringOutage(journey: Journey): Promise<OutageObservations> {
  const { site, plan, symbol } = journey;
  const late = plan.arriving.slice(CANDLES_BEFORE_OUTAGE);
  await seedCandles(site.subject, late, { symbol, allowFuture: true });
  const healthStatuses: number[] = [];
  let userRouteStatus = 0;
  const startedAt = Date.now();
  while (Date.now() - startedAt < OUTAGE_MILLISECONDS) {
    const health = await readPublicHealth(site);
    healthStatuses.push(health.status);
    if (health.status === 503)
      assertCondition(health.text === DEGRADED_BODY, `corpo: ${health.text}`);
    if (userRouteStatus === 0 && Date.now() - startedAt > USER_ROUTE_DELAY_MILLISECONDS) {
      const route = await site.api.call({ subject: USER_ROUTE_SUBJECT, path: '/v1/runs' });
      userRouteStatus = route.status;
      assertCondition(
        route.text.includes('DATABASE_UNAVAILABLE'),
        `rota de usuário: ${route.text}`,
      );
    }
    await Bun.sleep(HEALTH_SAMPLE_MILLISECONDS);
  }
  return { healthStatuses, userRouteStatus };
}

async function measureRecovery(journey: Journey): Promise<{ workerMs: number; healthMs: number }> {
  const { site, runId, finalCandleTime } = journey;
  site.proxy.setMode(OUTAGE_PROXY_MODE.FORWARD);
  const startedAt = Date.now();
  const healthMs = await waitUntil(
    'o /v1/health voltar a 200',
    async () => (await readPublicHealth(site)).status === 200,
    RECOVERY_LIMIT_MILLISECONDS,
  );
  const workerMs = await waitUntil(
    'o worker alcançar a última vela',
    async () => (await readProgress(site.subject, runId)).lastCandleTime === finalCandleTime,
    RECOVERY_LIMIT_MILLISECONDS,
  );
  assertCondition(Date.now() - startedAt <= RECOVERY_LIMIT_MILLISECONDS, 'volta passou de 60 s');
  return { workerMs, healthMs };
}

async function expectSameAsContinuous(journey: Journey, referenceRunId: string): Promise<string> {
  const { site, runId } = journey;
  const continuous = await readPersistedRun(site.reference.backtest, referenceRunId);
  const survived = await readPersistedRun(site.subject.backtest, runId);
  for (const table of ['signals', 'orders', 'fills', 'positions', 'equityPoints'] as const) {
    assertCondition(
      survived.counts[table] === continuous.counts[table],
      `${table}: ${survived.counts[table]} depois da queda e ${continuous.counts[table]} na execução contínua`,
    );
  }
  assertCondition(
    digestOf(survived.rows) === digestOf(continuous.rows),
    'as linhas depois da queda diferem das da execução contínua',
  );
  assertCondition(
    survived.lastCandleTime === continuous.lastCandleTime,
    'o último candle processado difere',
  );
  const { signals, fills } = continuous.counts;
  return `${signals} sinais e ${fills} preenchimentos`;
}

// O `docker restart` do Postgres de teste: o worker fica sem ver as velas novas (proxy recusa), elas entram, e o reinício
// real do contêiner derruba as conexões abertas no meio do trabalho. Só roda com OUTAGE_DOCKER_CONTAINER definido.
export async function checkDockerRestart(
  site: OutageSite,
  params: { readonly container: string; readonly symbol: string; readonly dockerCommand: string },
): Promise<void> {
  const { container, symbol, dockerCommand } = params;
  const plan = buildCandlePlan();
  const referenceRunId = await runContinuousReference(site, { symbol, plan });
  const journey = await startSubject(site, symbol, plan);
  const logStart = site.worker.current.lines().length;
  site.proxy.setMode(OUTAGE_PROXY_MODE.REFUSE);
  await seedCandles(site.subject, plan.arriving.slice(CANDLES_BEFORE_OUTAGE), {
    symbol,
    allowFuture: true,
  });
  site.proxy.setMode(OUTAGE_PROXY_MODE.FORWARD);
  const restartStartedAt = Date.now();
  const restart = Bun.spawn([dockerCommand, 'restart', container], {
    stdout: 'ignore',
    stderr: 'pipe',
  });
  const healthStatuses: number[] = [];
  while (
    (await Promise.race([restart.exited, Bun.sleep(HEALTH_SAMPLE_MILLISECONDS)])) === undefined
  ) {
    healthStatuses.push((await readPublicHealth(site)).status);
  }
  assertCondition(
    (await restart.exited) === 0,
    `docker restart falhou: ${await new Response(restart.stderr).text()}`,
  );
  const restartMs = Date.now() - restartStartedAt;
  assertCondition(
    healthStatuses.every((status) => status === 503 || status === 200),
    `/v1/health respondeu algo além de 200 e 503: ${healthStatuses.join(',')}`,
  );
  const recovery = await measureRecovery(journey);
  const counted = await expectSameAsContinuous(journey, referenceRunId);
  const audited = auditWorkerLog(site, logStart);
  const admin = await readAdminSnapshot(site);
  assertCondition(admin.database.state === 'up', `database.state: ${admin.database.state}`);
  await cancelRun(site.subject, { runId: journey.runId });
  reportLine(
    `docker restart real de ${container} (${symbol}): reinício em ${restartMs} ms; /v1/health durante: ${healthStatuses.join(',') || 'sem amostra'}; 200 ${recovery.healthMs} ms depois; worker alcançou a última vela ${recovery.workerMs} ms depois (limite ${RECOVERY_LIMIT_MILLISECONDS} ms); ${counted} iguais aos da execução contínua; ${audited}`,
  );
}

export async function checkOutage(
  site: OutageSite,
  kind: OutageKind,
  symbol: string,
): Promise<void> {
  const plan = buildCandlePlan();
  const referenceRunId = await runContinuousReference(site, { symbol, plan });
  const journey = await startSubject(site, symbol, plan);
  const logStart = site.worker.current.lines().length;
  cutDatabase(site, kind);
  const observed = await observeDuringOutage(journey);
  assertCondition(observed.healthStatuses.includes(503), '/v1/health nunca respondeu 503');
  assertCondition(
    observed.healthStatuses.every((status) => status === 503 || status === 200),
    `/v1/health respondeu algo além de 200 e 503: ${observed.healthStatuses.join(',')}`,
  );
  assertCondition(observed.userRouteStatus === 503, `rota de usuário: ${observed.userRouteStatus}`);
  const recovery = await measureRecovery(journey);
  const counted = await expectSameAsContinuous(journey, referenceRunId);
  const audited = auditWorkerLog(site, logStart);
  const admin = await readAdminSnapshot(site);
  assertCondition(admin.database.state === 'up', `database.state: ${admin.database.state}`);
  assertCondition(admin.database.lastFailureCode !== null, 'lastFailureCode vazio depois da queda');
  await cancelRun(site.subject, { runId: journey.runId });
  reportLine(
    `${kind} (${symbol}): ${OUTAGE_MILLISECONDS / 1000} s fora; /v1/health 503 durante e 200 ${recovery.healthMs} ms depois da volta; worker alcançou a última vela ${recovery.workerMs} ms depois (limite ${RECOVERY_LIMIT_MILLISECONDS} ms); ${counted} iguais aos da execução contínua; rota de usuário 503 DATABASE_UNAVAILABLE; ${audited}`,
  );
}
