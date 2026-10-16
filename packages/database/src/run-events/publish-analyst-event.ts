// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { RUN_EVENT_KIND, RUN_EVENTS_CHANNEL } from './run-event.constant.js';

export type PublishAnalystEventParams = {
  readonly executor: DatabaseExecutor;
  readonly runId: string;
  readonly candleTime: number;
};

// O aviso da decisão do analista é só o ponteiro `{ runId, kind, eventId }` (a vela decidida), na MESMA transação do passo:
// chega no COMMIT e some no ROLLBACK. O dono é resolvido pela API no banco, nunca pelo aviso.
export async function publishAnalystEvent(params: PublishAnalystEventParams): Promise<void> {
  const payload = JSON.stringify({
    runId: params.runId,
    kind: RUN_EVENT_KIND.ANALYST,
    eventId: String(params.candleTime),
  });
  await params.executor.execute(sql`SELECT pg_notify(${RUN_EVENTS_CHANNEL}, ${payload})`);
}
