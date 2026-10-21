// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DATABASE_UNAVAILABLE_CODE } from './connection.constant.js';
import { DatabaseUnavailableError, isQueryTimeout } from './connection-error.js';
import {
  admit,
  closeAllClients,
  closeIfIdle,
  createGate,
  readGateHealth,
  recordFailure,
  registerFailure,
  reopen,
  recordSuccess,
  type Gate,
  type Slot,
  type Unit,
} from './connection-gate.js';
import type { ResilientDatabase, ResilientDatabaseSettings } from './resilient-database.types.js';
import type { SqlClient, SqlQuery } from './sql-client.types.js';

function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

type TimeoutRaceParams<TResult> = {
  readonly start: () => PromiseLike<TResult>;
  readonly milliseconds: number;
  readonly onTimeout: () => void;
};

// O Bun não tem teto de consulta e `cancel()` não solta uma conexão muda: o teto é nosso (ADR 0002, R4).
function raceWithTimeout<TResult>(params: TimeoutRaceParams<TResult>): Promise<TResult> {
  return new Promise<TResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      params.onTimeout();
      reject(new DatabaseUnavailableError(DATABASE_UNAVAILABLE_CODE.QUERY_TIMEOUT));
    }, params.milliseconds);
    const finish = (settle: () => void): void => {
      clearTimeout(timer);
      settle();
    };
    try {
      params.start().then(
        (value) => finish(() => resolve(value)),
        (error: unknown) => finish(() => reject(toError(error))),
      );
    } catch (error: unknown) {
      finish(() => reject(toError(error)));
    }
  });
}

// A conexão do cliente não respondeu dentro do teto. Reabre e pergunta ao banco por um cliente novo: se ele responde, só a
// unidade falha (conexão muda, banco vivo); se não, o banco está fora (R4).
async function confirmQueryTimeout(gate: Gate, slot: Slot, error: unknown): Promise<void> {
  if (gate.isClosed || slot !== gate.current) return;
  reopen(gate);
  const fresh = gate.current;
  const isAlive = await pingClient(fresh.client, gate.settings.confirmTimeoutMilliseconds);
  if (fresh !== gate.current) return;
  if (isAlive) recordSuccess(gate, fresh);
  else registerFailure(gate, error);
}

async function pingClient(client: SqlClient, milliseconds: number): Promise<boolean> {
  try {
    await raceWithTimeout({
      start: () => client.unsafe('SELECT 1'),
      milliseconds,
      onTimeout: noop,
    });
    return true;
  } catch {
    return false;
  }
}

function noop(): void {
  // O ping não tem unidade para abandonar.
}

async function settleFailure(gate: Gate, slot: Slot, error: unknown): Promise<void> {
  if (isQueryTimeout(error)) await confirmQueryTimeout(gate, slot, error);
  else recordFailure(gate, slot, error);
}

// Uma unidade = uma consulta avulsa ou uma transação inteira, sempre no cliente atual (a que já está no velho termina nele).
async function runUnit<TResult>(
  gate: Gate,
  start: (client: SqlClient) => PromiseLike<TResult>,
): Promise<TResult> {
  const isProbe = admit(gate);
  const slot = gate.current;
  const unit: Unit = { isAbandoned: false };
  slot.units.add(unit);
  try {
    const result = await raceWithTimeout({
      start: () => start(slot.client),
      milliseconds: gate.settings.queryTimeoutMilliseconds,
      onTimeout: () => {
        unit.isAbandoned = true;
      },
    });
    recordSuccess(gate, slot);
    return result;
  } catch (error: unknown) {
    await settleFailure(gate, slot, error);
    throw error;
  } finally {
    slot.units.delete(unit);
    if (isProbe) gate.status.isProbing = false;
    closeIfIdle(gate, slot);
  }
}

function createLazyQuery(gate: Gate, query: string, parameters: unknown[] | undefined): SqlQuery {
  return {
    then: (onFulfilled, onRejected) =>
      runUnit(gate, (client) => client.unsafe(query, parameters)).then(onFulfilled, onRejected),
    values: () => ({
      then: (onFulfilled, onRejected) =>
        runUnit(gate, (client) => client.unsafe(query, parameters).values()).then(
          onFulfilled,
          onRejected,
        ),
    }),
  };
}

export function createResilientDatabase(settings: ResilientDatabaseSettings): ResilientDatabase {
  const gate = createGate(settings);
  return {
    unsafe: (query, parameters) => createLazyQuery(gate, query, parameters),
    begin: (callback) => runUnit(gate, (client) => client.begin(callback)),
    close: () => closeAllClients(gate),
    readHealth: () => readGateHealth(gate),
  };
}
