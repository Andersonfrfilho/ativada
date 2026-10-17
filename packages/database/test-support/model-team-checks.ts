// Copyright (c) 2026 Ada Technology. All rights reserved.
import { join } from 'node:path';

import { createAnalystDecisionRepository } from '../src/analyst/analyst-decision.repository.js';
import { MIGRATIONS_FOLDER } from '../src/database.constant.js';
import { MODEL_TEAM_REPORT_STATUS } from '../src/model-teams/model-team.constant.js';
import { createTeamReportRepository } from '../src/model-teams/team-report.repository.js';
import type { TeamReportSlot } from '../src/model-teams/team-report.types.js';
import { createTeamRunInputRepository } from '../src/model-teams/team-run-input.repository.js';
import { createUserModelTeamRepository } from '../src/model-teams/user-model-team.repository.js';
import { createRunBatchRepository } from '../src/run-results/run-batch.repository.js';
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

const DEADLINE_FAR = 4_102_444_800_000;
const DEADLINE_PAST = 946_684_800_000;
const ROLES_JSON = JSON.stringify({
  trend: { stance: 'up', reason: 'a' },
  risk: { level: 'low', reason: 'b' },
  decision: { reason: 'c' },
});

async function seedScheduledReport(
  client: Bun.SQL,
  params: { readonly symbol: string; readonly status: 'decided' | 'pending' },
): Promise<string> {
  const id = Bun.randomUUIDv7();
  const isDecided = params.status === 'decided';
  await client`INSERT INTO model_team_reports (id, team_key, provider, model_id, prompt_version, kind, symbol, timeframe, candle_time, status, action, entry_price, target_price, stop_price, confidence, roles, decided_at)
    VALUES (${id}, 'lucas', 'anthropic', 'm', 'team-prompt-1', 'scheduled', ${params.symbol}, '15m', ${CANDLE_TIME}, ${params.status},
      ${isDecided ? 'buy' : null}, ${isDecided ? '100.5' : null}, ${isDecided ? '102' : null}, ${isDecided ? '99.5' : null},
      ${isDecided ? 62 : null}, ${isDecided ? ROLES_JSON : null}::jsonb, ${isDecided ? new Date() : null})`;
  return id;
}

async function checkTeamRunLookup(context: LifecycleCheckContext): Promise<string> {
  const { handle, client, assertCondition, reportCheck } = context;
  const inputs = createTeamRunInputRepository(handle);
  const reportId = await seedScheduledReport(client, { symbol: 'LOOKUPUSDT', status: 'decided' });
  const base = { teamKey: 'lucas', symbol: 'LOOKUPUSDT', candleTime: CANDLE_TIME };
  const inTime = await inputs.lookupScheduledReport({ ...base, deadlineAt: DEADLINE_FAR });
  assertCondition(
    !inTime.isPastDeadline && inTime.report?.isDecidedInTime === true,
    'prazo no futuro: não vencido e decidido a tempo',
  );
  assertCondition(
    inTime.report?.decision?.entryPrice === '100.5' && inTime.report.decision.confidence === 62,
    'o relatório volta com os preços em texto e a confiança',
  );
  const late = await inputs.lookupScheduledReport({ ...base, deadlineAt: DEADLINE_PAST });
  assertCondition(
    late.isPastDeadline && late.report?.isDecidedInTime === false,
    'prazo vencido pelo relógio do banco: decisão tardia não conta como a tempo',
  );
  const missing = await inputs.lookupScheduledReport({
    ...base,
    symbol: 'NOTHINGUSDT',
    deadlineAt: DEADLINE_PAST,
  });
  assertCondition(
    missing.isPastDeadline && missing.report === undefined,
    'vela sem relatório: devolve só o veredito do prazo',
  );
  const pendingId = await seedScheduledReport(client, { symbol: 'PENDINGUSDT', status: 'pending' });
  const pending = await inputs.lookupScheduledReport({
    ...base,
    symbol: 'PENDINGUSDT',
    deadlineAt: DEADLINE_FAR,
  });
  assertCondition(
    pending.report?.id === pendingId && pending.report.decision === undefined,
    'relatório pendente não traz decisão',
  );
  reportCheck('equipes: busca do relatório agendado com o prazo pelo relógio do banco');
  return reportId;
}

async function checkTeamRunInputs(context: LifecycleCheckContext, reportId: string): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const inputs = createTeamRunInputRepository(handle);
  const owner = await seedRunning(context, 'subject-team-run-input', 'LOOKUPUSDT');
  const stranger = await resolvePersistenceOwner(handle, 'subject-team-run-input-stranger');
  const batches = createRunBatchRepository(handle);
  const write = (
    candleTime: number,
    extra: { reportId: string | null; failureCode: string | null },
  ): Promise<boolean | undefined> =>
    batches.runInBatch(owner.scope, owner.runId, (writer) =>
      writer.appendTeamRunInput({ candleTime, appliedAction: 'hold', ...extra }),
    );
  assertCondition(
    (await write(CANDLE_TIME, { reportId, failureCode: null })) === true,
    'a entrada da vela grava',
  );
  assertCondition(
    (await write(CANDLE_TIME, { reportId, failureCode: null })) === false,
    'gravar a mesma vela de novo é idempotente',
  );
  const stored = await inputs.readStoredInput(owner.scope, {
    runId: owner.runId,
    candleTime: CANDLE_TIME,
  });
  assertCondition(
    stored?.reportId === reportId && stored.appliedAction === 'hold',
    'o dono lê a entrada gravada',
  );
  assertCondition(
    (await inputs.readStoredInput(stranger.scope, {
      runId: owner.runId,
      candleTime: CANDLE_TIME,
    })) === undefined,
    'outro usuário não lê a entrada alheia',
  );
  const report = await inputs.readReportById(reportId);
  assertCondition(
    report?.status === 'decided' && report.decision?.action === 'buy',
    'o relatório referenciado volta pelo id',
  );
  const code = await captureErrorCode(
    Promise.resolve(write(CANDLE_TIME + 900_000, { reportId: null, failureCode: null })),
  );
  assertCondition(
    code === CHECK_VIOLATION_SQLSTATE,
    'sem relatório e sem código é recusado pelo CHECK',
  );
  await write(CANDLE_TIME + 1_800_000, { reportId: null, failureCode: 'MISSING' });
  assertCondition(
    (
      await inputs.readStoredInput(owner.scope, {
        runId: owner.runId,
        candleTime: CANDLE_TIME + 1_800_000,
      })
    )?.failureCode === 'MISSING',
    'a vela sem leitura grava o código',
  );
  const rows = rowsOf<CountRow>(
    await client`SELECT count(*)::int AS total FROM team_run_inputs WHERE run_id = ${owner.runId}`,
  );
  assertCondition(rows[0]?.total === 2, 'uma linha por vela');
  reportCheck('equipes: entrada gravada da execução (idempotente, preso ao dono, CHECK da origem)');
}

export async function checkModelTeams(context: LifecycleCheckContext): Promise<void> {
  await checkEnqueue(context);
  await checkClaim(context);
  await checkBudgetAndFinish(context);
  await checkReadingsAndOwners(context);
  await checkTeamRunInputs(context, await checkTeamRunLookup(context));
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
