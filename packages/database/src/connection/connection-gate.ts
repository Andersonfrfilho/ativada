// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  DATABASE_CONNECTION_STATE,
  DATABASE_UNAVAILABLE_CODE,
  RETIRED_CLIENT_CLOSE_TIMEOUT_SECONDS,
  type DatabaseConnectionState,
} from './connection.constant.js';
import {
  DatabaseUnavailableError,
  isDatabaseConnectionFailure,
  isFailFastRejection,
  isQueryTimeout,
} from './connection-error.js';
import { computeBackoff } from './reconnect-backoff.js';
import type { DatabaseHealth, ResilientDatabaseSettings } from './resilient-database.types.js';
import { readSafeErrorFields } from './safe-error-fields.js';
import type { SqlClient } from './sql-client.types.js';

// Uma unidade de trabalho em voo num cliente. Abandonada = estourou o teto: quem chamou já recebeu a falha.
export type Unit = { isAbandoned: boolean };

export type Slot = {
  readonly client: SqlClient;
  readonly units: Set<Unit>;
};

type Status = {
  state: DatabaseConnectionState;
  failures: number;
  downSince: number | undefined;
  nextAttemptAt: number | undefined;
  isProbing: boolean;
  lastFailureCode: string | undefined;
  lastFailureErrno: string | undefined;
  lastFailureAt: number | undefined;
};

export type Gate = {
  readonly settings: ResilientDatabaseSettings;
  readonly retired: Set<Slot>;
  readonly status: Status;
  current: Slot;
  // Depois do close() o porteiro não admite unidade nem abre cliente: o laço atrasado do desligamento só leva a falha rápida.
  isClosed: boolean;
};

function createSlot(client: SqlClient): Slot {
  return { client, units: new Set() };
}

export function createGate(settings: ResilientDatabaseSettings): Gate {
  return {
    settings,
    retired: new Set(),
    current: createSlot(settings.openClient()),
    isClosed: false,
    status: {
      state: DATABASE_CONNECTION_STATE.UP,
      failures: 0,
      downSince: undefined,
      nextAttemptAt: undefined,
      isProbing: false,
      lastFailureCode: undefined,
      lastFailureErrno: undefined,
      lastFailureAt: undefined,
    },
  };
}

export async function closeClient(client: SqlClient): Promise<void> {
  try {
    await client.close({ timeout: RETIRED_CLIENT_CLOSE_TIMEOUT_SECONDS });
  } catch {
    // Cliente aposentado que não fecha direito não muda nada para quem já está no cliente novo.
  }
}

// R6: o cliente velho só fecha quando não resta unidade DENTRO do teto; a transação viva termina nele.
export function closeIfIdle(gate: Gate, slot: Slot): void {
  if (!gate.retired.has(slot)) return;
  if ([...slot.units].some((unit) => !unit.isAbandoned)) return;
  gate.retired.delete(slot);
  void closeClient(slot.client);
}

function reopen(gate: Gate): void {
  if (gate.isClosed) return;
  const previous = gate.current;
  gate.current = createSlot(gate.settings.openClient());
  gate.retired.add(previous);
  closeIfIdle(gate, previous);
}

// Devolve `true` quando esta unidade é a sonda da espera; as outras, enquanto `down`, falham na hora (R2).
export function admit(gate: Gate): boolean {
  const { status, settings } = gate;
  if (gate.isClosed) throw new DatabaseUnavailableError(DATABASE_UNAVAILABLE_CODE.UNAVAILABLE);
  if (status.state === DATABASE_CONNECTION_STATE.UP) return false;
  const isBeforeNextAttempt = settings.now() < (status.nextAttemptAt ?? 0);
  if (status.isProbing || isBeforeNextAttempt) {
    throw new DatabaseUnavailableError(DATABASE_UNAVAILABLE_CODE.UNAVAILABLE);
  }
  status.isProbing = true;
  return true;
}

export function recordSuccess(gate: Gate, slot: Slot): void {
  if (slot !== gate.current) return;
  const { status } = gate;
  status.state = DATABASE_CONNECTION_STATE.UP;
  status.failures = 0;
  status.downSince = undefined;
  status.nextAttemptAt = undefined;
}

// Só conta a falha de conexão do cliente atual: erro de consulta, falha rápida do próprio porteiro e eco de um cliente
// já aposentado não mexem no estado.
export function recordFailure(gate: Gate, slot: Slot, error: unknown): void {
  if (slot !== gate.current) return;
  if (!isDatabaseConnectionFailure(error) || isFailFastRejection(error)) return;
  const { status, settings } = gate;
  const now = settings.now();
  const fields = readSafeErrorFields(error);
  status.failures += 1;
  status.lastFailureCode = fields.code;
  status.lastFailureErrno = fields.errno;
  status.lastFailureAt = now;
  if (status.state === DATABASE_CONNECTION_STATE.UP) {
    status.state = DATABASE_CONNECTION_STATE.DOWN;
    status.downSince = now;
  }
  status.nextAttemptAt =
    now +
    computeBackoff({
      attempt: status.failures,
      baseMilliseconds: settings.reconnectBaseMilliseconds,
      maxMilliseconds: settings.reconnectMaxMilliseconds,
      random: settings.random(),
    });
  if (isQueryTimeout(error) || status.failures >= settings.failureThreshold) reopen(gate);
}

export function readGateHealth(gate: Gate): DatabaseHealth {
  const { status } = gate;
  return {
    state: status.state,
    consecutiveFailures: status.failures,
    downSince: status.downSince,
    nextAttemptAt: status.nextAttemptAt,
    lastFailureCode: status.lastFailureCode,
    lastFailureErrno: status.lastFailureErrno,
    lastFailureAt: status.lastFailureAt,
  };
}

export async function closeAllClients(gate: Gate): Promise<void> {
  gate.isClosed = true;
  const slots = [gate.current, ...gate.retired];
  gate.retired.clear();
  await Promise.all(slots.map((slot) => closeClient(slot.client)));
}
