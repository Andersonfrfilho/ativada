// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  SqlClient,
  SqlCloseOptions,
  SqlQuery,
  SqlTransaction,
} from '../src/connection/sql-client.types.js';

// Dublê do cliente SQL que cai e volta sob comando, com os erros que a reprodução da spec 006 mediu no Bun.SQL
// (ADR 0002, "Simulação ao vivo robusta"). O servidor falso manda no modo; cada cliente aberto é uma "conexão".

export const FLAKY_MODE = {
  HEALTHY: 'healthy',
  // Banco fora: toda consulta recusa (ERR_POSTGRES_CONNECTION_REFUSED).
  REFUSED: 'refused',
  // Conexão fechada no meio: em voo e novas rejeitam com ERR_POSTGRES_CONNECTION_CLOSED.
  CLOSED: 'closed',
  // Parada limpa (docker stop): consulta 57P01; a transação parada entre comandos, ERR_POSTGRES_EXPECTED_REQUEST.
  STOPPING: 'stopping',
  // Servidor congelado (docker pause): consultas penduram e terminam quando ele descongela; cliente novo dá TIMEOUT.
  FROZEN: 'frozen',
  // Meia conexão: as conexões abertas ficam mudas PARA SEMPRE (só close() as solta); as novas funcionam.
  HUNG: 'hung',
} as const;
export type FlakyMode = (typeof FLAKY_MODE)[keyof typeof FLAKY_MODE];

export const FLAKY_ERROR_CODE = {
  CLOSED: 'ERR_POSTGRES_CONNECTION_CLOSED',
  REFUSED: 'ERR_POSTGRES_CONNECTION_REFUSED',
  TIMEOUT: 'ERR_POSTGRES_CONNECTION_TIMEOUT',
  EXPECTED_REQUEST: 'ERR_POSTGRES_EXPECTED_REQUEST',
  SERVER_ERROR: 'ERR_POSTGRES_SERVER_ERROR',
} as const;

export const ADMIN_SHUTDOWN_SQLSTATE = '57P01';
// Vai na mensagem de todo erro do dublê: o teste que olha o log procura isto e não pode achar.
export const FLAKY_SECRET_URL = 'postgres://ativada:s3cret-pw@db.internal:5432/ativada';
export const FLAKY_ROWS: readonly unknown[] = [{ ok: 1 }];
export const FLAKY_VALUES: readonly unknown[] = [[1]];

export class FlakyPostgresError extends Error {
  override readonly name = 'PostgresError';
  readonly code: string;
  readonly errno: string | undefined;
  readonly severity: string | undefined;

  constructor(code: string, errno?: string) {
    super(`connection problem with ${FLAKY_SECRET_URL}`);
    this.code = code;
    this.errno = errno;
    this.severity = errno === undefined ? undefined : 'FATAL';
  }
}

// O que o Drizzle faz com o erro do driver: name "Error", mensagem com a consulta e os parâmetros, driver em `cause`.
export function wrapLikeDrizzle(
  cause: unknown,
  query = 'select 1',
  parameters: string[] = [],
): Error {
  return new Error(`Failed query: ${query}\nparams: ${parameters.join(',')}`, { cause });
}

type Pending = {
  readonly client: FlakyClient;
  readonly kind: 'held' | 'frozen' | 'mute';
  readonly settle: (outcome: { readonly error: Error } | { readonly value: unknown }) => void;
};

export type FlakyClient = SqlClient & {
  readonly id: number;
  readonly executed: string[];
  readonly closeTimeouts: (number | undefined)[];
  readonly isClosed: () => boolean;
  readonly isMute: () => boolean;
  readonly openTransactions: () => number;
};

export type FlakyServer = {
  readonly openClient: () => FlakyClient;
  readonly setMode: (mode: FlakyMode) => void;
  readonly mode: () => FlakyMode;
  // Consultas passam a ficar em voo até `release()` ou até o modo mudar.
  readonly hold: () => void;
  readonly release: () => void;
  readonly clients: readonly FlakyClient[];
};

type Decision =
  | { readonly kind: 'ok' }
  | { readonly kind: 'reject'; readonly error: Error }
  | { readonly kind: 'pend'; readonly pending: Pending['kind'] };

function failure(code: string, errno?: string): Decision {
  return { kind: 'reject', error: new FlakyPostgresError(code, errno) };
}

export function createFlakyServer(): FlakyServer {
  let mode: FlakyMode = FLAKY_MODE.HEALTHY;
  let isHolding = false;
  const pendings = new Set<Pending>();
  const clients: FlakyClient[] = [];
  const mutedClients = new Set<FlakyClient>();
  const clientsOpenedWhileFrozen = new Set<FlakyClient>();

  function decide(client: FlakyClient, isInTransaction: boolean): Decision {
    if (client.isClosed()) return failure(FLAKY_ERROR_CODE.CLOSED);
    if (client.isMute()) return { kind: 'pend', pending: 'mute' };
    switch (mode) {
      case FLAKY_MODE.REFUSED:
        return failure(FLAKY_ERROR_CODE.REFUSED);
      case FLAKY_MODE.CLOSED:
        return failure(FLAKY_ERROR_CODE.CLOSED);
      case FLAKY_MODE.STOPPING:
        return isInTransaction
          ? failure(FLAKY_ERROR_CODE.EXPECTED_REQUEST)
          : failure(FLAKY_ERROR_CODE.SERVER_ERROR, ADMIN_SHUTDOWN_SQLSTATE);
      case FLAKY_MODE.FROZEN:
        return clientsOpenedWhileFrozen.has(client)
          ? failure(FLAKY_ERROR_CODE.TIMEOUT)
          : { kind: 'pend', pending: 'frozen' };
      default:
        return isHolding ? { kind: 'pend', pending: 'held' } : { kind: 'ok' };
    }
  }

  function run(
    client: FlakyClient,
    query: string,
    isInTransaction: boolean,
    rows: unknown,
  ): Promise<unknown> {
    client.executed.push(query);
    const decision = decide(client, isInTransaction);
    if (decision.kind === 'ok') return Promise.resolve(rows);
    if (decision.kind === 'reject') return Promise.reject(decision.error);
    return new Promise<unknown>((resolve, reject) => {
      pendings.add({
        client,
        kind: decision.pending,
        settle: (outcome) => ('error' in outcome ? reject(outcome.error) : resolve(rows)),
      });
    });
  }

  function createQuery(client: FlakyClient, query: string, isInTransaction: boolean): SqlQuery {
    return {
      then: (onFulfilled, onRejected) =>
        run(client, query, isInTransaction, FLAKY_ROWS).then(onFulfilled, onRejected),
      values: () => ({
        then: (onFulfilled, onRejected) =>
          run(client, query, isInTransaction, FLAKY_VALUES).then(onFulfilled, onRejected),
      }),
    };
  }

  function settleWhere(
    predicate: (pending: Pending) => boolean,
    outcome: Parameters<Pending['settle']>[0],
  ): void {
    for (const pending of [...pendings]) {
      if (!predicate(pending)) continue;
      pendings.delete(pending);
      pending.settle(outcome);
    }
  }

  function applyMode(next: FlakyMode): void {
    const previous = mode;
    mode = next;
    const isKillable = (pending: Pending): boolean => !pending.client.isMute();
    if (next === FLAKY_MODE.REFUSED || next === FLAKY_MODE.CLOSED) {
      settleWhere(isKillable, { error: new FlakyPostgresError(FLAKY_ERROR_CODE.CLOSED) });
    }
    if (next === FLAKY_MODE.STOPPING) {
      const error = new FlakyPostgresError(FLAKY_ERROR_CODE.SERVER_ERROR, ADMIN_SHUTDOWN_SQLSTATE);
      settleWhere(isKillable, { error });
    }
    if (next === FLAKY_MODE.HUNG) {
      for (const client of clients) if (!client.isClosed()) mutedClients.add(client);
    }
    if (previous === FLAKY_MODE.FROZEN && next === FLAKY_MODE.HEALTHY) {
      settleWhere((pending) => pending.kind === 'frozen' && !pending.client.isMute(), {
        value: undefined,
      });
    }
  }

  function openClient(): FlakyClient {
    let isClosed = false;
    let openTransactions = 0;
    const executed: string[] = [];
    const closeTimeouts: (number | undefined)[] = [];
    const client: FlakyClient = {
      id: clients.length + 1,
      executed,
      closeTimeouts,
      isClosed: () => isClosed,
      isMute: () => mutedClients.has(client),
      openTransactions: () => openTransactions,
      unsafe: (query) => createQuery(client, query, false),
      begin: async (callback) => {
        const transaction: SqlTransaction = {
          unsafe: (query) => createQuery(client, query, true),
        };
        await run(client, 'begin', false, undefined);
        openTransactions += 1;
        try {
          return await callback(transaction);
        } finally {
          openTransactions -= 1;
        }
      },
      close: (options?: SqlCloseOptions) => {
        isClosed = true;
        closeTimeouts.push(options?.timeout);
        settleWhere((pending) => pending.client === client, {
          error: new FlakyPostgresError(FLAKY_ERROR_CODE.CLOSED),
        });
        return Promise.resolve();
      },
    };
    if (mode === FLAKY_MODE.FROZEN) clientsOpenedWhileFrozen.add(client);
    clients.push(client);
    return client;
  }

  return {
    openClient,
    setMode: applyMode,
    mode: () => mode,
    hold: (): void => {
      isHolding = true;
    },
    release: (): void => {
      isHolding = false;
      settleWhere((pending) => pending.kind === 'held' && !pending.client.isMute(), {
        value: undefined,
      });
    },
    clients,
  };
}
