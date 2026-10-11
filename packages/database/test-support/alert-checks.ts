// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AlertSide } from '../src/alerts/alert.constant.js';
import {
  ALERT_ATTEMPTS_EXHAUSTED_ERROR_CODE,
  ALERT_SIDE,
  ALERT_STATUS,
} from '../src/alerts/alert.constant.js';
import { createAlertRepository } from '../src/alerts/alert.repository.js';
import type { AlertInput } from '../src/alerts/alert.types.js';
import { FOREIGN_KEY_VIOLATION_SQLSTATE } from '../src/postgres-error-code.js';
import { createRunBatchRepository } from '../src/run-results/run-batch.repository.js';
import { RUN_KIND, RUN_STATUS } from '../src/runs/run.constant.js';
import { createRunMetricsRepository } from '../src/runs/run-metrics.repository.js';
import { createRunRepository } from '../src/runs/run.repository.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import {
  candleTimeAt,
  captureErrorCode,
  resolvePersistenceOwner,
  seedRun,
  type PersistenceOwner,
} from './persistence-seed.js';

const CHAT_OF_A = '730000001';
const CHAT_OF_B = '730000002';
const LEASE_MILLISECONDS = 60_000;
const MAXIMUM_ATTEMPTS = 5;
// Uma hora à frente do relógio do banco: tudo o que os checks enfileiram já está vencido para o despachante.
const NOW = new Date(Date.now() + 3_600_000);
const CHECK_VIOLATION_SQLSTATE = '23514';
const RACED_ALERTS = 20;

type AlertRow = Record<string, unknown>;
type SeededOwner = PersistenceOwner & { readonly runId: string };

function draftOf(index: number, side: AlertSide = ALERT_SIDE.BUY): AlertInput {
  return { candleTime: candleTimeAt(index), side, payload: { marker: `alert-${index}` } };
}

async function seedAlertOwner(
  context: LifecycleCheckContext,
  params: { readonly subject: string; readonly chat: string | undefined },
): Promise<SeededOwner> {
  const owner = await resolvePersistenceOwner(context.handle, params.subject);
  const run = await seedRun(context.handle, owner, { kind: RUN_KIND.LIVE_PAPER });
  if (params.chat !== undefined) {
    await context.client`UPDATE users SET telegram_chat_id = ${params.chat} WHERE id = ${owner.userId}`;
  }
  return { ...owner, runId: run.id };
}

async function enqueue(
  context: LifecycleCheckContext,
  owner: SeededOwner,
  drafts: readonly AlertInput[],
): Promise<number> {
  const written = await createRunBatchRepository(context.handle).runInBatch(
    owner.scope,
    owner.runId,
    (writer) => writer.appendAlerts(drafts),
  );
  return written?.written ?? -1;
}

async function readRows(context: LifecycleCheckContext, runId: string): Promise<AlertRow[]> {
  const rows: unknown = await context.client`SELECT * FROM alerts WHERE run_id = ${runId}
    ORDER BY candle_time, side`;
  return rows as AlertRow[];
}

async function checkEnqueueRules(context: LifecycleCheckContext): Promise<SeededOwner> {
  const { client, assertCondition, reportCheck } = context;
  const owner = await seedAlertOwner(context, { subject: 'subject-alert-a', chat: CHAT_OF_A });
  const unlinked = await seedAlertOwner(context, {
    subject: 'subject-alert-none',
    chat: undefined,
  });
  assertCondition((await enqueue(context, owner, [draftOf(1)])) === 1, 'dono vinculado enfileira');
  assertCondition(
    (await enqueue(context, owner, [draftOf(1)])) === 0,
    'o mesmo candle e lado não duplica',
  );
  assertCondition(
    (await enqueue(context, owner, [draftOf(1, ALERT_SIDE.SELL)])) === 1,
    'lado diferente no mesmo candle é outro alerta',
  );
  assertCondition(
    (await enqueue(context, unlinked, [draftOf(1)])) === 0,
    'sem vínculo não enfileira',
  );
  await client`UPDATE users SET alert_telegram_enabled = false WHERE id = ${owner.userId}`;
  assertCondition((await enqueue(context, owner, [draftOf(2)])) === 0, 'alertas desligados');
  await client`UPDATE users SET alert_telegram_enabled = true WHERE id = ${owner.userId}`;
  const stored = await readRows(context, owner.runId);
  assertCondition(stored.length === 2, `esperadas 2 linhas, obtidas ${stored.length}`);
  assertCondition(
    stored.every((row) => row['status'] === ALERT_STATUS.PENDING && row['attempts'] === 0),
    'nasce pendente e sem tentativas',
  );
  assertCondition(
    !JSON.stringify(stored).includes(CHAT_OF_A),
    'o chat do dono não é copiado para a linha do alerta',
  );
  reportCheck(
    'alertas: só dono vinculado e ligado enfileira; chave (execução, candle, lado) única',
  );
  return owner;
}

async function checkForeignKey(context: LifecycleCheckContext, owner: SeededOwner): Promise<void> {
  const { client, assertCondition, reportCheck } = context;
  const other = await seedAlertOwner(context, { subject: 'subject-alert-b', chat: CHAT_OF_B });
  const crossed = await captureErrorCode(
    client`INSERT INTO alerts (id, user_id, run_id, candle_time, side, channel, payload)
      VALUES (${Bun.randomUUIDv7()}, ${other.userId}, ${owner.runId}, 1, 'BUY', 'telegram', '{}'::jsonb)`,
  );
  assertCondition(
    crossed === FOREIGN_KEY_VIOLATION_SQLSTATE,
    `alerta de B na execução de A deveria violar a FK composta, obtido ${crossed}`,
  );
  const inconsistent = await captureErrorCode(
    client`UPDATE alerts SET status = 'sent' WHERE run_id = ${owner.runId}`,
  );
  assertCondition(
    inconsistent === CHECK_VIOLATION_SQLSTATE,
    `status sent sem sent_at deveria violar o CHECK, obtido ${inconsistent}`,
  );
  reportCheck('alertas: FK composta recusa execução de outro dono e o CHECK liga sent a sent_at');
}

async function checkClaiming(context: LifecycleCheckContext, owner: SeededOwner): Promise<void> {
  const { client, assertCondition, reportCheck } = context;
  const other = await seedAlertOwner(context, { subject: 'subject-alert-c', chat: '730000003' });
  await enqueue(context, other, [draftOf(1)]);
  const alerts = createAlertRepository(context.handle);
  const params = {
    now: NOW,
    limit: 50,
    leaseMilliseconds: LEASE_MILLISECONDS,
    maximumAttempts: MAXIMUM_ATTEMPTS,
  };
  const claimed = await alerts.claimDue(params);
  const byRun = new Map(claimed.map((item) => [item.runId, item]));
  assertCondition(
    byRun.get(owner.runId)?.chatId === CHAT_OF_A,
    'o alerta de A sai com o chat de A',
  );
  assertCondition(byRun.get(other.runId)?.chatId === '730000003', 'o de C sai com o chat de C');
  assertCondition(
    claimed.every((item) => item.attempts === 1),
    'a reivindicação conta a tentativa',
  );
  assertCondition((await alerts.claimDue(params)).length === 0, 'arrendado não é reivindicado');
  const afterLeases = (count: number): Date =>
    new Date(NOW.getTime() + count * (LEASE_MILLISECONDS + 1));
  const later = { ...params, now: afterLeases(1) };
  const again = await alerts.claimDue(later);
  assertCondition(
    again.length === claimed.length && again.every((item) => item.attempts === 2),
    'arrendamento vencido volta a ser reivindicável com a tentativa seguinte',
  );
  await client`UPDATE users SET alert_telegram_enabled = false WHERE id = ${owner.userId}`;
  const afterSwitchOff = await alerts.claimDue({ ...later, now: afterLeases(2) });
  assertCondition(
    afterSwitchOff.find((item) => item.runId === owner.runId)?.chatId === undefined,
    'alertas desligados depois de enfileirar: nada a entregar',
  );
  await client`UPDATE users SET alert_telegram_enabled = true WHERE id = ${owner.userId}`;
  await client`UPDATE users SET telegram_chat_id = NULL WHERE id = ${owner.userId}`;
  const afterUnlink = await alerts.claimDue({ ...later, now: afterLeases(3) });
  const unlinkedAlert = afterUnlink.find((item) => item.runId === owner.runId);
  assertCondition(
    unlinkedAlert !== undefined && unlinkedAlert.chatId === undefined,
    'desvinculado: o alerta sai sem chat (nada a entregar)',
  );
  await client`UPDATE users SET telegram_chat_id = ${CHAT_OF_A} WHERE id = ${owner.userId}`;
  reportCheck(
    'alertas: reivindicação com arrendamento, chat lido do dono da linha e desvinculação',
  );
}

async function checkRace(context: LifecycleCheckContext): Promise<void> {
  const { assertCondition, reportCheck } = context;
  const owner = await seedAlertOwner(context, { subject: 'subject-alert-race', chat: '730000004' });
  const drafts = Array.from({ length: RACED_ALERTS }, (_unused, index) => draftOf(100 + index));
  assertCondition((await enqueue(context, owner, drafts)) === RACED_ALERTS, 'lote enfileirado');
  const alerts = createAlertRepository(context.handle);
  const params = {
    now: NOW,
    limit: RACED_ALERTS,
    leaseMilliseconds: LEASE_MILLISECONDS,
    maximumAttempts: MAXIMUM_ATTEMPTS,
  };
  const [first, second, third] = await Promise.all([
    alerts.claimDue(params),
    alerts.claimDue(params),
    alerts.claimDue(params),
  ]);
  const ids = [...(first ?? []), ...(second ?? []), ...(third ?? [])]
    .filter((item) => item.runId === owner.runId)
    .map((item) => item.id);
  assertCondition(ids.length === RACED_ALERTS, `todos reivindicados: ${ids.length}`);
  assertCondition(new Set(ids).size === RACED_ALERTS, 'três despachantes nunca pegam o mesmo');
  reportCheck(`alertas: 3 despachantes simultâneos repartem ${RACED_ALERTS} alertas sem repetir`);
}

async function checkTransitions(context: LifecycleCheckContext): Promise<void> {
  const { assertCondition, reportCheck } = context;
  const owner = await seedAlertOwner(context, { subject: 'subject-alert-flow', chat: '730000005' });
  await enqueue(context, owner, [draftOf(1), draftOf(2), draftOf(3), draftOf(4)]);
  const alerts = createAlertRepository(context.handle);
  const claimed = await alerts.claimDue({
    now: NOW,
    limit: 50,
    leaseMilliseconds: 1,
    maximumAttempts: MAXIMUM_ATTEMPTS,
  });
  const mine = claimed.filter((item) => item.runId === owner.runId);
  const [toSend, toRetry, toFail, toSkip] = mine.map((item) => item.id);
  const retryAt = new Date(NOW.getTime() + 120_000);
  await alerts.markSent({ alertId: toSend ?? '', now: NOW });
  await alerts.reschedule({
    alertId: toRetry ?? '',
    nextAttemptAt: retryAt,
    errorCode: 'http_500',
  });
  await alerts.markFailed({ alertId: toFail ?? '', errorCode: 'http_400' });
  await alerts.markSkipped({ alertId: toSkip ?? '', errorCode: 'no_link' });
  await alerts.markFailed({ alertId: toSend ?? '', errorCode: 'late' });
  const rows = new Map((await readRows(context, owner.runId)).map((row) => [row['id'], row]));
  assertCondition(rows.get(toSend)?.['status'] === ALERT_STATUS.SENT, 'enviado');
  assertCondition(rows.get(toSend)?.['sent_at'] !== null, 'enviado tem sent_at');
  assertCondition(rows.get(toSend)?.['last_error'] === null, 'um estado final não é reaberto');
  assertCondition(
    rows.get(toRetry)?.['status'] === ALERT_STATUS.PENDING,
    'reagendado segue pendente',
  );
  assertCondition(rows.get(toRetry)?.['last_error'] === 'http_500', 'código do erro gravado');
  assertCondition(rows.get(toFail)?.['status'] === ALERT_STATUS.FAILED, 'falhou');
  assertCondition(rows.get(toSkip)?.['status'] === ALERT_STATUS.SKIPPED, 'dispensado');
  const early = await alerts.claimDue({
    now: new Date(NOW.getTime() + 60_000),
    limit: 50,
    leaseMilliseconds: 1,
    maximumAttempts: MAXIMUM_ATTEMPTS,
  });
  assertCondition(!early.some((item) => item.id === toRetry), 'reagendado espera a hora marcada');
  const due = await alerts.claimDue({
    now: new Date(retryAt.getTime() + 1),
    limit: 50,
    leaseMilliseconds: 1,
    maximumAttempts: MAXIMUM_ATTEMPTS,
  });
  assertCondition(
    due.some((item) => item.id === toRetry),
    'reagendado volta na hora marcada',
  );
  reportCheck('alertas: enviado, reagendado, falho e dispensado; estado final não reabre');
}

async function checkPoisonedAlert(context: LifecycleCheckContext): Promise<void> {
  const { assertCondition, reportCheck } = context;
  const owner = await seedAlertOwner(context, {
    subject: 'subject-alert-poison',
    chat: '730000006',
  });
  await enqueue(context, owner, [draftOf(1)]);
  const alerts = createAlertRepository(context.handle);
  const claimOnce = (round: number): ReturnType<typeof alerts.claimDue> =>
    alerts.claimDue({
      now: new Date(NOW.getTime() + round * (LEASE_MILLISECONDS + 1)),
      limit: 50,
      leaseMilliseconds: LEASE_MILLISECONDS,
      maximumAttempts: MAXIMUM_ATTEMPTS,
    });
  const claimedRounds: number[] = [];
  for (let round = 1; round <= MAXIMUM_ATTEMPTS + 2; round += 1) {
    const mine = (await claimOnce(round)).filter((item) => item.runId === owner.runId);
    claimedRounds.push(mine.length);
  }
  assertCondition(
    claimedRounds.join(',') === '1,1,1,1,1,0,0',
    `o alerta que nunca conclui é entregue ${MAXIMUM_ATTEMPTS} vezes e depois não volta: ${claimedRounds.join(',')}`,
  );
  const [row] = await readRows(context, owner.runId);
  assertCondition(row?.['status'] === ALERT_STATUS.FAILED, 'esgotado vira falho');
  assertCondition(
    row?.['last_error'] === ALERT_ATTEMPTS_EXHAUSTED_ERROR_CODE && row['locked_until'] === null,
    'esgotado grava o motivo e solta o arrendamento',
  );
  reportCheck(
    'alertas: o que esgota as tentativas sem concluir é encerrado, não reivindicado para sempre',
  );
}

async function checkLatestMetrics(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-alert-metrics');
  const stranger = await resolvePersistenceOwner(handle, 'subject-alert-metrics-other');
  const runs = createRunRepository(handle);
  const metrics = createRunMetricsRepository(handle);
  const first = await seedRun(handle, owner, { kind: RUN_KIND.WALK_FORWARD });
  for (const status of [RUN_STATUS.RUNNING, RUN_STATUS.COMPLETED]) {
    await runs.transitionRun(owner.scope, {
      runId: first.id,
      to: status,
      metrics: { winRate: 'old' },
    });
  }
  assertCondition(
    (await metrics.findLatestMetrics(owner.scope, {
      strategyVersionId: first.strategyVersionId,
      kind: RUN_KIND.WALK_FORWARD,
    })) !== undefined,
    'a concluída é encontrada',
  );
  assertCondition(
    (await metrics.findLatestMetrics(stranger.scope, {
      strategyVersionId: first.strategyVersionId,
      kind: RUN_KIND.WALK_FORWARD,
    })) === undefined,
    'outro dono não vê as métricas',
  );
  assertCondition(
    (await metrics.findLatestMetrics(owner.scope, {
      strategyVersionId: first.strategyVersionId,
      kind: RUN_KIND.BACKTEST,
    })) === undefined,
    'só o tipo pedido',
  );
  reportCheck('métricas do último walk-forward: só do dono, só do tipo, só concluído');
}

// A contagem do teto diário: só `sent`, só do usuário, só a partir do instante dado; a reivindicação traz o dono da linha.
async function checkSentCount(context: LifecycleCheckContext): Promise<void> {
  const { assertCondition, reportCheck } = context;
  const owner = await seedAlertOwner(context, {
    subject: 'subject-alert-count',
    chat: '730000008',
  });
  const stranger = await seedAlertOwner(context, {
    subject: 'subject-alert-count-other',
    chat: '730000009',
  });
  await enqueue(context, owner, [draftOf(1), draftOf(2), draftOf(3), draftOf(4)]);
  await enqueue(context, stranger, [draftOf(1)]);
  const alerts = createAlertRepository(context.handle);
  const claimed = await alerts.claimDue({
    now: NOW,
    limit: 50,
    leaseMilliseconds: 1,
    maximumAttempts: MAXIMUM_ATTEMPTS,
  });
  const mine = claimed.filter((item) => item.runId === owner.runId);
  const theirs = claimed.filter((item) => item.runId === stranger.runId);
  assertCondition(
    mine.length === 4 && mine.every((item) => item.userId === owner.userId),
    'a reivindicação traz o dono de cada linha',
  );
  const [first, second, third, fourth] = mine;
  const earlier = new Date(NOW.getTime() - 60_000);
  await alerts.markSent({ alertId: first?.id ?? '', now: NOW });
  await alerts.markSent({ alertId: second?.id ?? '', now: earlier });
  await alerts.markFailed({ alertId: third?.id ?? '', errorCode: 'http_400' });
  await alerts.markSkipped({ alertId: fourth?.id ?? '', errorCode: 'daily_limit' });
  await alerts.markSent({ alertId: theirs[0]?.id ?? '', now: NOW });
  const since = (offsetMilliseconds: number): { userId: string; since: Date } => ({
    userId: owner.userId,
    since: new Date(NOW.getTime() + offsetMilliseconds),
  });
  assertCondition((await alerts.countSentSince(since(-120_000))) === 2, 'conta só as enviadas');
  assertCondition((await alerts.countSentSince(since(-30_000))) === 1, 'e só a partir do instante');
  assertCondition((await alerts.countSentSince(since(0))) === 1, 'inclusive no instante exato');
  assertCondition((await alerts.countSentSince(since(1))) === 0, 'e nada depois');
  const other = await alerts.countSentSince({ userId: stranger.userId, since: earlier });
  assertCondition(other === 1, 'a contagem é de cada usuário');
  reportCheck('alertas: a contagem do teto diário conta só enviadas, do usuário, na janela');
}

export async function checkAlerts(context: LifecycleCheckContext): Promise<void> {
  const owner = await checkEnqueueRules(context);
  await checkForeignKey(context, owner);
  await checkClaiming(context, owner);
  await checkRace(context);
  await checkTransitions(context);
  await checkSentCount(context);
  await checkPoisonedAlert(context);
  await checkLatestMetrics(context);
}
