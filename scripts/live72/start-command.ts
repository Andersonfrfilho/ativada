// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  computeStrategyLeadInCandles,
  createStrategyVersion,
} from '../../packages/strategy-engine/src/index.js';
import { z } from '../../packages/environment/src/index.js';
import type { CliContext } from './cli-context.js';
import { linkFakeTelegram, openSession } from './identity-session.js';
import {
  CONTROLLED_KILL_HOURS,
  MILLISECONDS_PER_HOUR,
  RUN_SETUP,
  SIMULATION_HOURS,
} from './live72.constant.js';
import { openLive72Sql } from './live72-database.js';
import { readRunFile, writeRunFile, type RunFile } from './run-file.js';
import {
  createGoal,
  createLiveRun,
  pickStrategyVersion,
  waitForFirstRound,
  type ApiAccess,
  type RunProgress,
} from './start-api.js';

async function assertWarmUp(context: CliContext, leadInCandles: number): Promise<void> {
  const sql = openLive72Sql(context.environment.DATABASE_URL);
  try {
    const rows: unknown = await sql`
      SELECT count(*)::int AS total FROM candles
      WHERE symbol = ${RUN_SETUP.SYMBOL} AND timeframe = ${RUN_SETUP.TIMEFRAME}`;
    const total = z.object({ total: z.number().int() }).parse(Array.isArray(rows) ? rows[0] : {});
    if (total.total <= leadInCandles) {
      throw new Error(
        `aquecimento incompleto: ${total.total} candles para ${leadInCandles} exigidos (rode make live72-up e aguarde o backfill)`,
      );
    }
  } finally {
    await sql.close();
  }
}

type SimulationParams = {
  readonly context: CliContext;
  readonly access: ApiAccess;
  readonly userId: string;
};

async function createSimulation(params: SimulationParams): Promise<string[]> {
  const { context, access } = params;
  const { strategyName, version } = await pickStrategyVersion(access);
  const leadInCandles = computeStrategyLeadInCandles(createStrategyVersion(version.config).config);
  await assertWarmUp(context, leadInCandles);
  const goalId = await createGoal(access);
  const run = await createLiveRun(access, { strategyVersionId: version.id, goalId });
  const startedAt = Date.parse(run.createdAt);
  const file: RunFile = {
    runId: run.id,
    userId: params.userId,
    goalId,
    strategyName,
    strategyVersionId: version.id,
    strategyVersion: version.version,
    configHash: version.configHash,
    symbol: RUN_SETUP.SYMBOL,
    timeframe: RUN_SETUP.TIMEFRAME,
    initialBalance: RUN_SETUP.INITIAL_BALANCE,
    periodStart: run.periodStart,
    leadInCandles,
    startedAt: run.createdAt,
    plannedEndAt: new Date(startedAt + SIMULATION_HOURS * MILLISECONDS_PER_HOUR).toISOString(),
    plannedWorkerKillAt: new Date(
      startedAt + CONTROLLED_KILL_HOURS * MILLISECONDS_PER_HOUR,
    ).toISOString(),
  };
  writeRunFile(context.paths.runFile, file);
  return describeStart(file, await waitForFirstRound(access, run.id));
}

function describeStart(file: RunFile, first: RunProgress | undefined): string[] {
  const round =
    first === undefined
      ? 'AVISO: a primeira rodada do worker ainda não avaliou o aquecimento (confira com make live72-status)'
      : `primeira rodada avaliada: status ${first.status}, último candle ${new Date(first.lastCandleTime ?? 0).toISOString()}`;
  return [
    `simulação ${file.runId} criada (${file.symbol} ${file.timeframe}, ${file.initialBalance} USDT fictícios)`,
    `início ${file.startedAt}; término previsto ${file.plannedEndAt}`,
    `reinício controlado do worker agendado para ${file.plannedWorkerKillAt}`,
    round,
  ];
}

export async function runStart(context: CliContext): Promise<string[]> {
  const existing = readRunFile(context.paths.runFile);
  if (existing !== undefined) {
    return [`simulação já iniciada: ${existing.runId} (início ${existing.startedAt})`];
  }
  const session = await openSession({
    identity: context.identity,
    apiBaseUrl: context.apiUrl,
    credentials: context.credentials,
  });
  if (!session.isTelegramLinked) {
    await linkFakeTelegram({
      apiBaseUrl: context.apiUrl,
      accessToken: session.accessToken,
      webhookSecret: context.environment.TELEGRAM_WEBHOOK_SECRET,
    });
  }
  const access = { apiUrl: context.apiUrl, token: session.accessToken };
  return createSimulation({ context, access, userId: session.userId });
}
