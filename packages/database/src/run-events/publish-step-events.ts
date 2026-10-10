// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import type { UserId } from '../ownership/user-id.js';
import { RUN_EVENT_KIND, RUN_EVENTS_CHANNEL } from './run-event.constant.js';

export type PublishStepEventsParams = {
  readonly executor: DatabaseExecutor;
  readonly ownerUserId: UserId;
  readonly runId: string;
  readonly candleTime: number;
};

// Um `NOTIFY` por linha que o passo do candle gravou — sinal, operação e saldo —, na MESMA transação do passo: o Postgres
// só entrega no COMMIT e descarta no ROLLBACK, então o aviso nunca precede nem sobrevive ao dado. O aviso é só o ponteiro
// `{ runId, kind, eventId }`: sem dono, sem preço, sem quantidade. Devolve quantos avisos saíram.
export async function publishStepEvents(params: PublishStepEventsParams): Promise<number> {
  const { executor, ownerUserId, runId, candleTime } = params;
  const rows: unknown = await executor.execute(sql`
    SELECT pg_notify(${RUN_EVENTS_CHANNEL}, event.payload) AS sent FROM (
      SELECT jsonb_build_object('runId', run_id::text, 'kind', ${RUN_EVENT_KIND.SIGNAL}::text, 'eventId', id::text)::text AS payload
      FROM signals WHERE run_id = ${runId} AND user_id = ${ownerUserId} AND candle_time = ${candleTime}
      UNION ALL
      SELECT jsonb_build_object('runId', run_id::text, 'kind', ${RUN_EVENT_KIND.TRADE}::text, 'eventId', id::text)::text
      FROM fills WHERE run_id = ${runId} AND user_id = ${ownerUserId} AND candle_time = ${candleTime}
      UNION ALL
      SELECT jsonb_build_object('runId', run_id::text, 'kind', ${RUN_EVENT_KIND.BALANCE}::text, 'eventId', candle_time::text)::text
      FROM equity_points WHERE run_id = ${runId} AND user_id = ${ownerUserId} AND candle_time = ${candleTime}
    ) AS event
  `);
  return Array.isArray(rows) ? rows.length : 0;
}
