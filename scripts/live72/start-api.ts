// Copyright (c) 2026 Ada Technology. All rights reserved.
import { requestApi, type ApiAnswer } from '../admin-test/api-request.js';
import { z } from '../../packages/environment/src/index.js';
import {
  HTTP_ACCEPTED,
  HTTP_CREATED,
  HTTP_OK,
  MILLISECONDS_PER_SECOND,
  RUN_SETUP,
} from './live72.constant.js';

const FIRST_ROUND_POLLS = 36;
const POLL_MILLISECONDS = 5 * MILLISECONDS_PER_SECOND;
const PAGE_LIMIT = 100;

const strategySchema = z.object({ id: z.string(), name: z.string(), isExample: z.boolean() });
const versionSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  config: z.unknown(),
  configHash: z.string(),
});
const runCreatedSchema = z.object({
  id: z.string(),
  createdAt: z.iso.datetime(),
  periodStart: z.number().int(),
});
const runProgressSchema = z.object({
  status: z.string(),
  lastCandleTime: z.number().int().nullable(),
});
const idSchema = z.object({ id: z.string() });

export type StrategyVersion = z.infer<typeof versionSchema>;
export type CreatedRun = z.infer<typeof runCreatedSchema>;
export type RunProgress = z.infer<typeof runProgressSchema>;
export type ApiAccess = { readonly apiUrl: string; readonly token: string };

function readList(answer: ApiAnswer): unknown[] {
  const data = answer.json['data'];
  return Array.isArray(data) ? data : [];
}

function expectStatus(answer: ApiAnswer, expected: number, what: string): void {
  if (answer.status !== expected) throw new Error(`${what}: HTTP ${answer.status}`);
}

export async function pickStrategyVersion(
  access: ApiAccess,
): Promise<{ readonly strategyName: string; readonly version: StrategyVersion }> {
  const { apiUrl, token } = access;
  const list = await requestApi({
    baseUrl: apiUrl,
    path: `/v1/strategies?limit=${PAGE_LIMIT}`,
    token,
  });
  expectStatus(list, HTTP_OK, 'listar estratégias');
  const strategies = readList(list).map((row) => strategySchema.parse(row));
  const strategy = strategies.find((entry) => entry.isExample) ?? strategies[0];
  if (strategy === undefined)
    throw new Error('nenhuma estratégia (a de exemplo deveria estar semeada)');
  const path = `/v1/strategies/${strategy.id}/versions?limit=${PAGE_LIMIT}`;
  const versions = await requestApi({ baseUrl: apiUrl, path, token });
  expectStatus(versions, HTTP_OK, 'listar versões');
  const latest = readList(versions)
    .map((row) => versionSchema.parse(row))
    .sort((left, right) => right.version - left.version)[0];
  if (latest === undefined) throw new Error('a estratégia não tem versão');
  return { strategyName: strategy.name, version: latest };
}

export async function createGoal(access: ApiAccess): Promise<string> {
  const answer = await requestApi({
    baseUrl: access.apiUrl,
    path: '/v1/goals',
    method: 'POST',
    token: access.token,
    body: {
      symbol: RUN_SETUP.SYMBOL,
      targetRate: RUN_SETUP.GOAL_TARGET_RATE,
      maxLossRate: RUN_SETUP.GOAL_MAX_LOSS_RATE,
      horizonDays: RUN_SETUP.GOAL_HORIZON_DAYS,
    },
  });
  expectStatus(answer, HTTP_CREATED, 'criar a meta');
  return idSchema.parse(answer.json['data']).id;
}

export async function createLiveRun(
  access: ApiAccess,
  params: { readonly strategyVersionId: string; readonly goalId: string },
): Promise<CreatedRun> {
  const answer = await requestApi({
    baseUrl: access.apiUrl,
    path: '/v1/runs',
    method: 'POST',
    token: access.token,
    body: {
      strategyVersionId: params.strategyVersionId,
      kind: 'live_paper',
      symbol: RUN_SETUP.SYMBOL,
      timeframe: RUN_SETUP.TIMEFRAME,
      goalId: params.goalId,
      runParameters: { initialBalance: RUN_SETUP.INITIAL_BALANCE },
    },
  });
  expectStatus(answer, HTTP_ACCEPTED, 'criar a simulação ao vivo');
  return runCreatedSchema.parse(answer.json['data']);
}

export async function waitForFirstRound(
  access: ApiAccess,
  runId: string,
): Promise<RunProgress | undefined> {
  for (let attempt = 0; attempt < FIRST_ROUND_POLLS; attempt += 1) {
    const answer = await requestApi({
      baseUrl: access.apiUrl,
      path: `/v1/runs/${runId}`,
      token: access.token,
    });
    const progress = runProgressSchema.safeParse(answer.json['data']);
    if (progress.success && progress.data.lastCandleTime !== null) return progress.data;
    await Bun.sleep(POLL_MILLISECONDS);
  }
  return undefined;
}
