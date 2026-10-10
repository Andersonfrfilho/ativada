// Copyright (c) 2026 Ada Technology. All rights reserved.
import type * as StreamConstantModule from '../../../apps/api-cryptoada/src/stream/stream.constant.js';
import type * as StreamHubModule from '../../../apps/api-cryptoada/src/stream/stream-hub.js';
import type * as StreamSweepModule from '../../../apps/api-cryptoada/src/stream/stream-sweep.js';
import type * as StreamEndpointModule from '../../../apps/api-cryptoada/src/stream/create-stream-endpoint.js';
import type * as RunEventDispatcherModule from '../../../apps/api-cryptoada/src/stream/run-event-dispatcher.js';
import type * as StreamTicketStoreModule from '../../../apps/api-cryptoada/src/stream/stream-ticket-store.js';
import type * as StreamEnvironmentModule from '../../../apps/api-cryptoada/src/stream/stream-environment.js';
import type * as BlockAccountModule from '../../../apps/api-cryptoada/src/admin/block-account.use-case.js';
import type * as DeleteAccountModule from '../../../apps/api-cryptoada/src/account/delete-account.use-case.js';
import type * as ApiEnvironmentModule from '../../../apps/api-cryptoada/src/environment.js';
import type * as TicketRoutesModule from '../../../apps/api-cryptoada/src/stream/stream-ticket.routes.js';
import type * as ServerModule from '../../../apps/api-cryptoada/src/server.js';
import type * as RateLimiterModule from '../../../apps/api-cryptoada/src/rate-limit/rate-limiter.js';
import type * as PolicyModule from '../../../apps/api-cryptoada/src/rate-limit/rate-limit-policy.constant.js';

const PRODUCTION_APP_SOURCE = new URL('../../../apps/api-cryptoada/src', import.meta.url).pathname;

// Os contratos do stream rodam contra a produção; o teste de mutantes os relança num processo à parte apontando esta
// variável para uma cópia mutada do `src` INTEIRO da API (o roteador, os erros e o stream vêm da mesma raiz).
export const STREAM_APP_SOURCE_VARIABLE = 'API_STREAM_APP_SOURCE';

export type StreamApp = {
  readonly constants: typeof StreamConstantModule;
  readonly hub: typeof StreamHubModule;
  readonly sweep: typeof StreamSweepModule;
  readonly endpoint: typeof StreamEndpointModule;
  readonly dispatcher: typeof RunEventDispatcherModule;
  readonly ticketStore: typeof StreamTicketStoreModule;
  readonly environment: typeof StreamEnvironmentModule;
  readonly blockAccount: typeof BlockAccountModule;
  readonly deleteAccount: typeof DeleteAccountModule;
  readonly apiEnvironment: typeof ApiEnvironmentModule;
  readonly ticketRoutes: typeof TicketRoutesModule;
  readonly server: typeof ServerModule;
  readonly rateLimiter: typeof RateLimiterModule;
  readonly policies: typeof PolicyModule;
};

export function resolveStreamAppSource(): string {
  return Bun.env[STREAM_APP_SOURCE_VARIABLE] ?? PRODUCTION_APP_SOURCE;
}

async function load<TModule>(file: string): Promise<TModule> {
  const module: unknown = await import(`${resolveStreamAppSource()}/${file}.ts`);
  return module as TModule;
}

export async function loadStreamApp(): Promise<StreamApp> {
  return {
    constants: await load('stream/stream.constant'),
    hub: await load('stream/stream-hub'),
    sweep: await load('stream/stream-sweep'),
    endpoint: await load('stream/create-stream-endpoint'),
    dispatcher: await load('stream/run-event-dispatcher'),
    ticketStore: await load('stream/stream-ticket-store'),
    environment: await load('stream/stream-environment'),
    blockAccount: await load('admin/block-account.use-case'),
    deleteAccount: await load('account/delete-account.use-case'),
    apiEnvironment: await load('environment'),
    ticketRoutes: await load('stream/stream-ticket.routes'),
    server: await load('server'),
    rateLimiter: await load('rate-limit/rate-limiter'),
    policies: await load('rate-limit/rate-limit-policy.constant'),
  };
}
