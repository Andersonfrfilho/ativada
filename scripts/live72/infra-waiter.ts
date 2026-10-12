// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EVENT_TYPE, MILLISECONDS_PER_SECOND } from './live72.constant.js';
import { appendEvent } from './live72-events.js';

const POLL_MILLISECONDS = 15 * MILLISECONDS_PER_SECOND;
const PROBE_TIMEOUT_MILLISECONDS = 5 * MILLISECONDS_PER_SECOND;
const COMPOSE_RETRY_EVERY_POLLS = 8;

export type InfraWaiterOptions = {
  readonly databaseUrl: string;
  readonly eventsFile: string;
  readonly composeUp: () => Promise<void>;
};

async function probeDatabase(databaseUrl: string): Promise<boolean> {
  const sql = new Bun.SQL(databaseUrl, { max: 1, connectionTimeout: 3 });
  try {
    await Promise.race([
      sql`SELECT 1`,
      Bun.sleep(PROBE_TIMEOUT_MILLISECONDS).then(() => Promise.reject(new Error('timeout'))),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    await sql.close().catch(() => undefined);
  }
}

// Filhos só (re)iniciam com o Postgres de pé: depois de um reinício do Mac o Docker pode demorar a voltar.
export function createInfraWaiter(options: InfraWaiterOptions): () => Promise<void> {
  let pending: Promise<void> | undefined;
  async function wait(): Promise<void> {
    let polls = 0;
    while (!(await probeDatabase(options.databaseUrl))) {
      appendEvent(options.eventsFile, EVENT_TYPE.INFRA_WAIT, { polls });
      if (polls % COMPOSE_RETRY_EVERY_POLLS === 0) await options.composeUp().catch(() => undefined);
      polls += 1;
      await Bun.sleep(POLL_MILLISECONDS);
    }
  }
  return (): Promise<void> => {
    pending ??= wait().finally(() => {
      pending = undefined;
    });
    return pending;
  };
}
