// Copyright (c) 2026 Ada Technology. All rights reserved.
import type * as BunTransportModule from '../../../packages/database/src/notifications/bun-postgres-transport.js';
import type * as ListenerModule from '../../../packages/database/src/notifications/notification-listener.js';
import type * as ConnectionUrlModule from '../../../packages/database/src/notifications/parse-connection-url.js';
import type * as WireDecodeModule from '../../../packages/database/src/notifications/postgres-wire-decode.js';
import type * as WireEncodeModule from '../../../packages/database/src/notifications/postgres-wire-encode.js';
import type * as ScramModule from '../../../packages/database/src/notifications/scram-sha-256.js';
import type * as RunEventConstantModule from '../../../packages/database/src/run-events/run-event.constant.js';
import type * as RunEventSchemaModule from '../../../packages/database/src/run-events/run-event.schema.js';

const PRODUCTION_SOURCE = new URL('../../../packages/database/src', import.meta.url).pathname;

// Os contratos do escutador rodam contra a produção; o teste de mutantes os relança num processo à parte apontando
// esta variável para uma cópia mutada de `packages/database/src`.
export const DATABASE_SOURCE_VARIABLE = 'DATABASE_LISTENER_SOURCE';

export type DatabaseListenerApi = {
  readonly bunTransport: typeof BunTransportModule;
  readonly listener: typeof ListenerModule;
  readonly connectionUrl: typeof ConnectionUrlModule;
  readonly wireDecode: typeof WireDecodeModule;
  readonly wireEncode: typeof WireEncodeModule;
  readonly scram: typeof ScramModule;
  readonly runEventConstant: typeof RunEventConstantModule;
  readonly runEventSchema: typeof RunEventSchemaModule;
};

export function resolveDatabaseSource(): string {
  return Bun.env[DATABASE_SOURCE_VARIABLE] ?? PRODUCTION_SOURCE;
}

async function load<TModule>(file: string): Promise<TModule> {
  const module: unknown = await import(`${resolveDatabaseSource()}/${file}.ts`);
  return module as TModule;
}

export async function loadDatabaseListenerApi(): Promise<DatabaseListenerApi> {
  return {
    bunTransport: await load('notifications/bun-postgres-transport'),
    listener: await load('notifications/notification-listener'),
    connectionUrl: await load('notifications/parse-connection-url'),
    wireDecode: await load('notifications/postgres-wire-decode'),
    wireEncode: await load('notifications/postgres-wire-encode'),
    scram: await load('notifications/scram-sha-256'),
    runEventConstant: await load('run-events/run-event.constant'),
    runEventSchema: await load('run-events/run-event.schema'),
  };
}
