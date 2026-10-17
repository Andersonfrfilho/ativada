// Copyright (c) 2026 Ada Technology. All rights reserved.
import { join } from 'node:path';

import { createAnalystDecisionRepository } from '../src/analyst/analyst-decision.repository.js';
import { MIGRATIONS_FOLDER } from '../src/database.constant.js';
import { MODEL_TEAM_REPORT_STATUS } from '../src/model-teams/model-team.constant.js';
import { createTeamReportRepository } from '../src/model-teams/team-report.repository.js';
import type { TeamReportSlot } from '../src/model-teams/team-report.types.js';
import { createUserModelTeamRepository } from '../src/model-teams/user-model-team.repository.js';
import { RUN_KIND, RUN_STATUS } from '../src/runs/run.constant.js';
import { createRunRepository } from '../src/runs/run.repository.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { buildAnalystDecisionInput } from './analyst-decision-checks.js';
import { captureErrorCode, resolvePersistenceOwner, seedRun } from './persistence-seed.js';

const CHECK_VIOLATION_SQLSTATE = '23514';
const CANDLE_TIME = 1_700_000_100_000;
const OFF_GRID_CANDLE_TIME = CANDLE_TIME + 900_000;
const SLOT: TeamReportSlot = { teamKey: 'nina', provider: 'google', modelId: 'fake-model-1' };
const LEASE_MILLISECONDS = 60_000;

type StatusRow = {
  readonly status: string;
  readonly attempt: number;
  readonly failure_code: string | null;
};

type CountRow = { readonly total: number };
type SumRow = { readonly cost: string; readonly reserved: string };

function rowsOf<TRow>(rows: unknown): readonly TRow[] {
  return Array.isArray(rows) ? (rows as readonly TRow[]) : [];
}

async function readRow(client: Bun.SQL, id: string): Promise<StatusRow | undefined> {
  const rows: unknown =
    await client`SELECT status, attempt, failure_code FROM model_team_reports WHERE id = ${id}`;
  return (rows as readonly StatusRow[])[0];
}

async function seedRunning(
  context: LifecycleCheckContext,
  subject: string,
  symbol: string,
): Promise<{
  readonly userId: string;
  readonly runId: string;
  readonly scope: Awaited<ReturnType<typeof resolvePersistenceOwner>>['scope'];
}> {
  const owner = await resolvePersistenceOwner(context.handle, subject);
  const run = await seedRun(context.handle, owner, {
    kind: RUN_KIND.LIVE_PAPER,
    symbol,
    timeframe: '15m',
    periodEnd: undefined,
  });
  await createRunRepository(context.handle).transitionRun(owner.scope, {
    runId: run.id,
    to: RUN_STATUS.RUNNING,
  });
  return { userId: owner.userId, runId: run.id, scope: owner.scope };
}

async function checkEnqueue(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const reports = createTeamReportRepository(handle);
  const owner = await seedRunning(context, 'subject-model-team-enqueue', 'LINKUSDT');
  const base = { teams: [SLOT], symbol: 'LINKUSDT', candleTime: CANDLE_TIME, cadenceMinutes: 15 };
  assertCondition((await reports.enqueueTeamReports(base)) === 0, 'equipe desligada não enfileira');
  await createUserModelTeamRepository(handle).setEnabled(owner.scope, {
    teamKey: 'nina',
    isEnabled: true,
  });
  assertCondition(
    (await reports.enqueueTeamReports(base)) === 1,
    'equipe ligada enfileira uma linha',
  );
  assertCondition(
    (await reports.enqueueTeamReports(base)) === 0,
    'enfileirar de novo é idempotente',
  );
  const other = { ...base, symbol: 'ADAUSDT' };
  assertCondition(
    (await reports.enqueueTeamReports(other)) === 0,
    'sem simulação rodando no par, nada nasce',
  );
  const hourly = { ...base, cadenceMinutes: 60, candleTime: OFF_GRID_CANDLE_TIME };
  const closeTime = hourly.candleTime + 900_000;
  const expected = closeTime % 3_600_000 === 0 ? 1 : 0;
  assertCondition(
    (await reports.enqueueTeamReports(hourly)) === expected,
    'o ritmo de 60 min só aceita a grade da hora',
  );
  const total = rowsOf<CountRow>(
    await client`SELECT count(*)::int AS total FROM model_team_reports WHERE symbol = 'LINKUSDT'`,
  );
  assertCondition((total[0]?.total ?? 0) >= 1, 'a linha enfileirada existe');
  reportCheck(
    'equipes: enfileirar idempotente, só com dono ligado, simulação rodando e ritmo na grade',
  );
}

async function checkClaim(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const reports = createTeamReportRepository(handle);
  const now = new Date();
  const claim = (at: Date): ReturnType<typeof reports.claimPending> =>
    reports.claimPending({ now: at, limit: 10, leaseMilliseconds: LEASE_MILLISECONDS });
  const [first, second] = await Promise.all([claim(now), claim(now)]);
  const ids = [...(first ?? []), ...(second ?? [])].map((row) => row.id);
  assertCondition(
    ids.length >= 1 && new Set(ids).size === ids.length,
    'duas reivindicações simultâneas não repetem linha',
  );
  const target = ids[0] ?? '';
  assertCondition((await claim(now)).length === 0, 'linha arrendada não é reivindicada de novo');
  const later = new Date(now.getTime() + LEASE_MILLISECONDS + 1);
  assertCondition(
    (await claim(later)).some((row) => row.id === target && row.attempt === 2),
    'arrendamento vencido devolve a linha (2ª tentativa)',
  );
  const afterTwo = new Date(later.getTime() + LEASE_MILLISECONDS + 1);
  await claim(afterTwo);
  const row = await readRow(client, target);
  assertCondition(
    row?.status === MODEL_TEAM_REPORT_STATUS.FAILED && row.failure_code === 'ATTEMPTS_EXHAUSTED',
    'passou das tentativas: falha ATTEMPTS_EXHAUSTED',
  );
  reportCheck('equipes: reivindicação sem repetir, arrendamento e tentativas esgotadas');
}

async function checkBudgetAndFinish(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const reports = createTeamReportRepository(handle);
  const ids = [Bun.randomUUIDv7(), Bun.randomUUIDv7()];
  for (const id of ids) {
    await client`INSERT INTO model_team_reports (id, team_key, provider, model_id, prompt_version, kind, symbol, timeframe, candle_time, status)
      VALUES (${id}, 'lucas', 'anthropic', 'm', 'team-prompt-1', 'on_demand', 'BUDGETUSDT', '15m', ${CANDLE_TIME}, 'pending')`;
  }
  const isAllowed = (usage: { dayUsd: string }): boolean => Number(usage.dayUsd) + 0.6 <= 1;
  const results = await Promise.all(
    ids.map((reportId) =>
      reports.reserveBudget({ reportId, reservationUsd: '0.60000000', isAllowed }),
    ),
  );
  assertCondition(
    results.filter((result) => result.isReserved).length === 1,
    'sob a trava, só uma reserva cabe no teto',
  );
  const reservedId = ids[results.findIndex((result) => result.isReserved)] ?? '';
  await reports.finish({
    reportId: reservedId,
    status: 'decided',
    costUsd: '0.01230000',
    measure: { inputTokens: 10, outputTokens: 5, thinkingTokens: 0, latencyMilliseconds: 120 },
    decision: {
      action: 'buy',
      entryPrice: '100',
      targetPrice: '102',
      stopPrice: '99',
      confidence: 60,
      roles: { trend: { stance: 'up', reason: 'x' } },
      isReasonHidden: false,
    },
  });
  const sums = rowsOf<SumRow>(
    await client`SELECT cost_usd::text AS cost, reserved_usd::text AS reserved FROM model_team_reports WHERE id = ${reservedId}`,
  );
  assertCondition(
    sums[0]?.cost === '0.01230000' && Number(sums[0].reserved) === 0,
    'finish grava o custo real e zera a reserva',
  );
  const code = await captureErrorCode(
    client`UPDATE model_team_reports SET stop_price = 105, entry_price = 100, target_price = 102, action = 'buy' WHERE id = ${reservedId}`,
  );
  assertCondition(
    code === CHECK_VIOLATION_SQLSTATE,
    'buy com proteção acima da entrada é recusado pelo CHECK',
  );
  reportCheck('equipes: teto sob trava consultiva, custo real e CHECK dos preços');
}

async function checkReadingsAndOwners(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const reports = createTeamReportRepository(handle);
  const owner = await seedRunning(context, 'subject-model-team-readings', 'READUSDT');
  await createAnalystDecisionRepository(handle).appendAnalystDecision(
    owner.scope,
    buildAnalystDecisionInput(owner.runId, CANDLE_TIME, {
      readings: { relativeVolume: '1.3', atrRate: '0.01', userNote: 'x' },
    }),
  );
  const readings = await reports.readPublicReadings({
    symbol: 'READUSDT',
    candleTime: CANDLE_TIME,
  });
  assertCondition(
    readings?.relativeVolume === '1.3' &&
      readings.atrRate === '0.01' &&
      readings.momentumLong === null,
    'leituras públicas voltam só com as seis chaves',
  );
  assertCondition(
    (await reports.readPublicReadings({ symbol: 'READUSDT', candleTime: 1 })) === undefined,
    'vela sem leitura devolve nada',
  );
  const teams = createUserModelTeamRepository(handle);
  const stranger = await resolvePersistenceOwner(handle, 'subject-model-team-stranger');
  await teams.setEnabled(owner.scope, { teamKey: 'olivia', isEnabled: true });
  assertCondition(
    (await teams.listTeams(stranger.scope)).length === 0,
    'outro usuário não vê o interruptor alheio',
  );
  assertCondition(
    (await teams.listTeams(owner.scope)).some(
      (team) => team.teamKey === 'olivia' && team.isEnabled,
    ),
    'o dono vê o próprio interruptor',
  );
  reportCheck('equipes: leituras públicas e interruptor preso ao dono');
}

export async function checkModelTeams(context: LifecycleCheckContext): Promise<void> {
  await checkEnqueue(context);
  await checkClaim(context);
  await checkBudgetAndFinish(context);
  await checkReadingsAndOwners(context);
}

const ROLLBACK_0027 = '0027_model_teams.rollback.sql';
const ROLLBACK_0027_GUARD_MESSAGE = 'não apaga relatórios';

// O rollback da 0027 perderia a reprodução das execuções de equipe: ABORTA enquanto existir uma, sem mudar nada.
export async function checkRollbackGuard(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-model-team-rollback');
  await seedRun(handle, owner, {
    kind: RUN_KIND.LIVE_PAPER,
    timeframe: '15m',
    periodEnd: undefined,
    request: { signalSource: { kind: 'model_team', team: 'nina' } },
  });
  const script = await Bun.file(join(MIGRATIONS_FOLDER, ROLLBACK_0027)).text();
  const failure = await client
    .begin((transaction) => transaction.unsafe(script))
    .then(
      () => undefined,
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
  assertCondition(
    failure?.includes(ROLLBACK_0027_GUARD_MESSAGE) === true,
    'o rollback da 0027 não abortou com execução de equipe',
  );
  const tables = rowsOf<CountRow>(
    await client`SELECT count(*)::int AS total FROM information_schema.tables WHERE table_name = 'model_team_reports'`,
  );
  assertCondition(tables[0]?.total === 1, 'o rollback abortado não apagou a tabela');
  reportCheck('equipes: rollback da 0027 aborta com execução de equipe e não muda nada');
}
