// Copyright (c) 2026 Ada Technology. All rights reserved.
import type * as BackoffModule from '../../../packages/database/src/connection/reconnect-backoff.js';
import type * as ConnectionErrorModule from '../../../packages/database/src/connection/connection-error.js';
import type * as OutageLogModule from '../../../packages/database/src/connection/outage-log.js';
import type * as ResilientModule from '../../../packages/database/src/connection/resilient-database.js';
import type * as SafeFieldsModule from '../../../packages/database/src/connection/safe-error-fields.js';
import type * as StatementTimeoutModule from '../../../packages/database/src/connection/statement-timeout.js';

const PRODUCTION_SOURCE = new URL('../../../packages/database/src', import.meta.url).pathname;

// Os contratos da reconexão rodam contra a produção; o teste de mutantes os relança num processo à parte apontando esta
// variável para uma cópia mutada de `packages/database/src`.
export const DATABASE_CONNECTION_SOURCE_VARIABLE = 'DATABASE_CONNECTION_SOURCE';

export type DatabaseConnectionApi = {
  readonly backoff: typeof BackoffModule;
  readonly connectionError: typeof ConnectionErrorModule;
  readonly outageLog: typeof OutageLogModule;
  readonly resilient: typeof ResilientModule;
  readonly safeFields: typeof SafeFieldsModule;
  readonly statementTimeout: typeof StatementTimeoutModule;
};

export function resolveDatabaseConnectionSource(): string {
  return Bun.env[DATABASE_CONNECTION_SOURCE_VARIABLE] ?? PRODUCTION_SOURCE;
}

async function load<TModule>(file: string): Promise<TModule> {
  const module: unknown = await import(`${resolveDatabaseConnectionSource()}/${file}.ts`);
  return module as TModule;
}

export async function loadDatabaseConnectionApi(): Promise<DatabaseConnectionApi> {
  return {
    backoff: await load('connection/reconnect-backoff'),
    connectionError: await load('connection/connection-error'),
    outageLog: await load('connection/outage-log'),
    resilient: await load('connection/resilient-database'),
    safeFields: await load('connection/safe-error-fields'),
    statementTimeout: await load('connection/statement-timeout'),
  };
}
