// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, eq, sql, type SQL } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { RUN_EVENT_KIND, RUN_EVENTS_CHANNEL } from '../run-events/run-event.constant.js';
import { runs } from '../schema/runs.schema.js';
import { RUN_STATUS } from './run.constant.js';

export type RecordDataWaitParams = {
  readonly runId: string;
  // A primeira abertura de candle que falta no buraco.
  readonly openTime: number;
  readonly now: number;
  // Quando (ms) terminou a última recuperação LIMPA do worker (tentou tudo e o buraco seguiu); 0 se ainda não houve nenhuma.
  readonly lastCleanRecoveryAt: number;
};

export type DataWaitState = {
  readonly since: number;
  readonly failedRecoveries: number;
  // A espera acabou de começar (ou o buraco mudou): é a hora de avisar o dono.
  readonly isNew: boolean;
};

// Uma recuperação limpa conta uma vez, e só se terminou DEPOIS de a espera começar: antes disso ela nem tinha visto o buraco.
function countsAsFailedRecovery(lastCleanRecoveryAt: number): SQL {
  return sql`(${lastCleanRecoveryAt}::bigint > ${runs.waitingSince}
    AND ${lastCleanRecoveryAt}::bigint > coalesce(${runs.waitingLastRecoveryAt}, 0))`;
}

// A decisão sobre a lacuna vive na linha da execução, não na memória do worker: reiniciar não perde nem a espera nem a contagem.
// Um UPDATE só lê a linha antiga em todas as expressões, então o contador nunca conta duas vezes a mesma recuperação.
export async function recordDataWait(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  params: RecordDataWaitParams,
): Promise<DataWaitState | undefined> {
  const isSameGap = sql`${runs.waitingOpenTime} = ${params.openTime}::bigint`;
  const counts = countsAsFailedRecovery(params.lastCleanRecoveryAt);
  const rows = await executor
    .update(runs)
    .set({
      waitingSince: sql`CASE WHEN ${isSameGap} THEN ${runs.waitingSince} ELSE ${params.now}::bigint END`,
      waitingOpenTime: params.openTime,
      waitingFailedRecoveries: sql`CASE WHEN ${isSameGap}
        THEN ${runs.waitingFailedRecoveries} + CASE WHEN ${counts} THEN 1 ELSE 0 END ELSE 0 END`,
      waitingLastRecoveryAt: sql`CASE WHEN ${isSameGap} AND ${counts} THEN ${params.lastCleanRecoveryAt}::bigint
        WHEN ${isSameGap} THEN ${runs.waitingLastRecoveryAt} ELSE NULL END`,
    })
    .where(
      and(
        ownerCondition(scope, runs.userId),
        eq(runs.id, params.runId),
        eq(runs.status, RUN_STATUS.RUNNING),
      ),
    )
    .returning({ since: runs.waitingSince, failedRecoveries: runs.waitingFailedRecoveries });
  const row = rows[0];
  if (row?.since === null || row === undefined) return undefined;
  const isNew = row.since === params.now;
  if (isNew) await publishWarning(executor, { runId: params.runId, since: row.since });
  return { since: row.since, failedRecoveries: row.failedRecoveries, isNew };
}

// O aviso à API é só o ponteiro `{ runId, kind, eventId }`; o painel relê a execução para ver `waitingForData`.
async function publishWarning(
  executor: DatabaseExecutor,
  params: { readonly runId: string; readonly since: number },
): Promise<void> {
  const payload = JSON.stringify({
    runId: params.runId,
    kind: RUN_EVENT_KIND.WARNING,
    eventId: String(params.since),
  });
  await executor.execute(sql`SELECT pg_notify(${RUN_EVENTS_CHANNEL}, ${payload})`);
}

// O buraco foi atravessado (preenchido ou confirmado): a execução volta a andar e a espera some.
export async function clearDataWait(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  runId: string,
): Promise<boolean> {
  const rows = await executor
    .update(runs)
    .set({
      waitingSince: null,
      waitingOpenTime: null,
      waitingFailedRecoveries: 0,
      waitingLastRecoveryAt: null,
    })
    .where(
      and(
        ownerCondition(scope, runs.userId),
        eq(runs.id, runId),
        sql`${runs.waitingSince} is not null`,
      ),
    )
    .returning({ id: runs.id });
  return rows.length > 0;
}
