// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createFlakyServer,
  FLAKY_MODE,
  FLAKY_ROWS,
  FlakyPostgresError,
  wrapLikeDrizzle,
  type FlakyServer,
} from '../packages/database/test-support/flaky-sql.js';
import { loadDatabaseConnectionApi } from './fixtures/database-connection/database-connection-source.fixture.js';

const { connectionError, resilient } = await loadDatabaseConnectionApi();
const { DatabaseUnavailableError } = connectionError;
const { createResilientDatabase } = resilient;

const TIMEOUT_MILLISECONDS = 25;
const BACKOFF_BASE = 1_000;
const BACKOFF_MAX = 30_000;
const SETTLE_MILLISECONDS = 10;
const LONG_TIMEOUT_MILLISECONDS = 100;
const CONFIRM_MILLISECONDS = 25;
const STATEMENT_TIMEOUT_MILLISECONDS = 10;

type Harness = {
  readonly server: FlakyServer;
  readonly database: ReturnType<typeof createResilientDatabase>;
  readonly advance: (milliseconds: number) => void;
  readonly now: () => number;
};

type HarnessOptions = { readonly random?: number; readonly timeoutMilliseconds?: number };

function createHarness(options: HarnessOptions = {}): Harness {
  const server = createFlakyServer();
  let clock = 1_000_000;
  const database = createResilientDatabase({
    openClient: () => server.openClient(),
    queryTimeoutMilliseconds: options.timeoutMilliseconds ?? TIMEOUT_MILLISECONDS,
    confirmTimeoutMilliseconds: CONFIRM_MILLISECONDS,
    now: () => clock,
    random: () => options.random ?? 0,
    failureThreshold: 2,
    reconnectBaseMilliseconds: BACKOFF_BASE,
    reconnectMaxMilliseconds: BACKOFF_MAX,
  });
  return {
    server,
    database,
    advance: (milliseconds): void => {
      clock += milliseconds;
    },
    now: () => clock,
  };
}

async function capture(work: PromiseLike<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error: unknown) {
    return error;
  }
  return undefined;
}

function expectUnavailable(error: unknown, code: string): void {
  expect(error).toBeInstanceOf(DatabaseUnavailableError);
  expect(error).toMatchObject({ code });
}

function expectDriverCode(error: unknown, code: string): void {
  expect(error).toBeInstanceOf(FlakyPostgresError);
  expect(error).toMatchObject({ code });
}

function settle(): Promise<void> {
  return Bun.sleep(SETTLE_MILLISECONDS);
}

describe('ResilientDatabase: healthy path', () => {
  test('passes rows and values through and stays up', async () => {
    const { database } = createHarness();
    expect(await database.unsafe('select 1', [])).toStrictEqual(FLAKY_ROWS);
    expect(await database.unsafe('select 1').values()).toStrictEqual([[1]]);
    expect(await database.begin(() => Promise.resolve('tx'))).toBe('tx');
    expect(database.readHealth()).toStrictEqual({
      state: 'up',
      consecutiveFailures: 0,
      downSince: undefined,
      nextAttemptAt: undefined,
      lastFailureCode: undefined,
      lastFailureErrno: undefined,
      lastFailureAt: undefined,
    });
  });

  test('a query error (23505, a failing callback) is not an outage and keeps its own error', async () => {
    const { database } = createHarness();
    const duplicate = new FlakyPostgresError('ERR_POSTGRES_SERVER_ERROR', '23505');
    const thrown = await capture(database.begin(() => Promise.reject(duplicate)));
    expect(thrown).toBe(duplicate);
    expect(database.readHealth().state).toBe('up');
    expect(database.readHealth().consecutiveFailures).toBe(0);
  });
});

describe('ResilientDatabase: down, fail fast, one probe, up', () => {
  test('the first connection failure goes down with the code and the backoff, without reopening', async () => {
    const { server, database, now } = createHarness();
    const first = server.clients[0];
    server.setMode(FLAKY_MODE.CLOSED);
    expectDriverCode(await capture(database.unsafe('select 1')), 'ERR_POSTGRES_CONNECTION_CLOSED');
    expect(database.readHealth()).toStrictEqual({
      state: 'down',
      consecutiveFailures: 1,
      downSince: now(),
      nextAttemptAt: now() + 500,
      lastFailureCode: 'ERR_POSTGRES_CONNECTION_CLOSED',
      lastFailureErrno: undefined,
      lastFailureAt: now(),
    });
    expect(server.clients).toHaveLength(1);
    expect(first?.isClosed()).toBe(false);
  });

  test('before the next attempt the work fails at once and never touches the client', async () => {
    const { server, database, advance } = createHarness();
    server.setMode(FLAKY_MODE.REFUSED);
    await capture(database.unsafe('select 1'));
    const client = server.clients[0];
    const executedBefore = client?.executed.length;
    advance(499);
    for (let round = 0; round < 50; round += 1) {
      expectUnavailable(await capture(database.unsafe('select 1')), 'DATABASE_UNAVAILABLE');
      expectUnavailable(
        await capture(database.begin(() => Promise.resolve(1))),
        'DATABASE_UNAVAILABLE',
      );
    }
    expect(client?.executed.length).toBe(executedBefore);
    expect(database.readHealth().consecutiveFailures).toBe(1);
  });

  test('after the wait only ONE probe goes out; the others keep failing fast until it answers', async () => {
    const { server, database, advance } = createHarness();
    server.setMode(FLAKY_MODE.REFUSED);
    await capture(database.unsafe('select 1'));
    server.setMode(FLAKY_MODE.HEALTHY);
    server.hold();
    advance(500);
    const probe = Promise.resolve(database.unsafe('probe'));
    expectUnavailable(await capture(database.unsafe('other')), 'DATABASE_UNAVAILABLE');
    server.release();
    expect(await probe).toStrictEqual(FLAKY_ROWS);
    expect(database.readHealth().state).toBe('up');
    expect(await database.unsafe('after')).toStrictEqual(FLAKY_ROWS);
  });

  test('the second failure in a row reopens the client: the old one is closed with a 1 s drain, new work goes to the new one', async () => {
    const { server, database, advance } = createHarness();
    server.setMode(FLAKY_MODE.CLOSED);
    await capture(database.unsafe('select 1'));
    advance(500);
    await capture(database.unsafe('probe'));
    expect(server.clients).toHaveLength(2);
    expect(server.clients[0]?.isClosed()).toBe(true);
    expect(server.clients[0]?.closeTimeouts).toStrictEqual([1]);
    expect(database.readHealth().consecutiveFailures).toBe(2);
    server.setMode(FLAKY_MODE.HEALTHY);
    advance(1_000);
    expect(await database.unsafe('after')).toStrictEqual(FLAKY_ROWS);
    expect(server.clients[1]?.executed).toStrictEqual(['after']);
    expect(database.readHealth().state).toBe('up');
    expect(database.readHealth().consecutiveFailures).toBe(0);
  });

  test('drops and comes back: down, reopen, up, with the backoff growing and never above 30 s', async () => {
    const { server, database, advance, now } = createHarness({ random: 1 });
    server.setMode(FLAKY_MODE.REFUSED);
    const waits: number[] = [];
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      await capture(database.unsafe('select 1'));
      const next = database.readHealth().nextAttemptAt ?? 0;
      waits.push(next - now());
      advance(next - now());
    }
    expect(waits).toStrictEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000]);
    server.setMode(FLAKY_MODE.HEALTHY);
    expect(await database.unsafe('back')).toStrictEqual(FLAKY_ROWS);
    expect(database.readHealth().state).toBe('up');
  });

  test('the parada limpa (57P01 in errno) is a connection failure and the errno is recorded', async () => {
    const { server, database } = createHarness();
    server.setMode(FLAKY_MODE.STOPPING);
    await capture(database.unsafe('select 1'));
    const health = database.readHealth();
    expect(health.state).toBe('down');
    expect(health.lastFailureCode).toBe('ERR_POSTGRES_SERVER_ERROR');
    expect(health.lastFailureErrno).toBe('57P01');
  });

  test('a driver error wrapped like Drizzle still counts; a fail-fast error inside a callback does not', async () => {
    const wrapped = createHarness();
    const closed = new FlakyPostgresError('ERR_POSTGRES_CONNECTION_CLOSED');
    await capture(wrapped.database.begin(() => Promise.reject(wrapLikeDrizzle(closed))));
    expect(wrapped.database.readHealth().state).toBe('down');
    const nested = createHarness();
    const failFast = new DatabaseUnavailableError('DATABASE_UNAVAILABLE');
    await capture(nested.database.begin(() => Promise.reject(wrapLikeDrizzle(failFast))));
    expect(nested.database.readHealth().state).toBe('up');
  });

  test('a probe that times out frees the probe slot for the next attempt', async () => {
    const { server, database, advance } = createHarness();
    server.setMode(FLAKY_MODE.REFUSED);
    await capture(database.unsafe('select 1'));
    server.setMode(FLAKY_MODE.HUNG);
    advance(500);
    expectUnavailable(await capture(database.unsafe('probe')), 'DATABASE_QUERY_TIMEOUT');
    expect(database.readHealth().state).toBe('up');
    server.setMode(FLAKY_MODE.HEALTHY);
    advance(1_000);
    expect(await database.unsafe('next')).toStrictEqual(FLAKY_ROWS);
    expect(database.readHealth().state).toBe('up');
  });
});

describe('ResilientDatabase: the time cap per unit', () => {
  test('a mute connection times out and reopens at once; the new client answers the check, so the database is NOT down', async () => {
    const { server, database } = createHarness();
    server.setMode(FLAKY_MODE.HUNG);
    expectUnavailable(await capture(database.unsafe('stuck')), 'DATABASE_QUERY_TIMEOUT');
    expect(server.clients).toHaveLength(2);
    expect(server.clients[0]?.isClosed()).toBe(true);
    expect(server.clients[1]?.executed).toStrictEqual(['SELECT 1']);
    expect(database.readHealth()).toMatchObject({ state: 'up', consecutiveFailures: 0 });
    expect(await database.unsafe('fresh')).toStrictEqual(FLAKY_ROWS);
    expect(server.clients[1]?.executed).toStrictEqual(['SELECT 1', 'fresh']);
  });

  test('a database that answers nothing to the check either goes down with the timeout as the last failure', async () => {
    const { server, database, advance } = createHarness();
    server.setMode(FLAKY_MODE.FROZEN);
    expectUnavailable(await capture(database.unsafe('stuck')), 'DATABASE_QUERY_TIMEOUT');
    expect(database.readHealth()).toMatchObject({
      state: 'down',
      consecutiveFailures: 1,
      lastFailureCode: 'DATABASE_QUERY_TIMEOUT',
    });
    server.setMode(FLAKY_MODE.HEALTHY);
    advance(500);
    expect(await database.unsafe('fresh')).toStrictEqual(FLAKY_ROWS);
    expect(database.readHealth().state).toBe('up');
  });

  test('a slow query over the client cap fails alone: the check passes, the database stays up and the next unit works', async () => {
    const { server, database } = createHarness();
    server.setMode(FLAKY_MODE.SLOW);
    expectUnavailable(await capture(database.unsafe('heavy')), 'DATABASE_QUERY_TIMEOUT');
    expect(database.readHealth()).toMatchObject({ state: 'up', consecutiveFailures: 0 });
    server.setMode(FLAKY_MODE.HEALTHY);
    expect(await database.unsafe('light')).toStrictEqual(FLAKY_ROWS);
    expect(database.readHealth().state).toBe('up');
  });

  test('a slow query aborted by the server statement_timeout (57014) is a query error: no down, no reopen, no client timer', async () => {
    const { server, database } = createHarness();
    server.setStatementTimeout(STATEMENT_TIMEOUT_MILLISECONDS);
    server.setMode(FLAKY_MODE.SLOW);
    expectDriverCode(await capture(database.unsafe('heavy')), 'ERR_POSTGRES_SERVER_ERROR');
    const thrown = await capture(
      database.begin(async (transaction) => {
        await transaction.unsafe('heavy');
      }),
    );
    expect(thrown).toMatchObject({ errno: '57014' });
    expect(thrown).not.toBeInstanceOf(DatabaseUnavailableError);
    expect(server.clients).toHaveLength(1);
    expect(database.readHealth()).toMatchObject({ state: 'up', consecutiveFailures: 0 });
  });

  test('a transaction that overruns the cap fails with the timeout and reopens at once', async () => {
    const { server, database } = createHarness();
    server.hold();
    const failure = await capture(
      database.begin(async (transaction) => {
        await transaction.unsafe('inside');
      }),
    );
    expectUnavailable(failure, 'DATABASE_QUERY_TIMEOUT');
    expect(server.clients).toHaveLength(2);
    expect(database.readHealth().state).toBe('down');
  });

  test('R7: a unit that overran the cap reports the failure even if the server applied it; what the old client says later is ignored', async () => {
    const { server, database } = createHarness();
    server.setMode(FLAKY_MODE.FROZEN);
    const late = capture(database.unsafe('maybe committed'));
    expectUnavailable(await late, 'DATABASE_QUERY_TIMEOUT');
    server.setMode(FLAKY_MODE.HEALTHY);
    await settle();
    expect(database.readHealth().state).toBe('down');
  });
});

describe('ResilientDatabase: a transaction in flight is never swapped out', () => {
  test('the old client stays open while the transaction lives, then closes; new work uses the new client', async () => {
    const { server, database, advance } = createHarness({
      timeoutMilliseconds: LONG_TIMEOUT_MILLISECONDS,
    });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transaction = database.begin(async (inner) => {
      await gate;
      await inner.unsafe('last statement');
      return 'committed';
    });
    await settle();
    server.setMode(FLAKY_MODE.CLOSED);
    await capture(database.unsafe('x'));
    advance(500);
    await capture(database.unsafe('y'));
    expect(server.clients).toHaveLength(2);
    expect(server.clients[0]?.isClosed()).toBe(false);
    expect(server.clients[0]?.closeTimeouts).toStrictEqual([]);
    server.setMode(FLAKY_MODE.HEALTHY);
    advance(1_000);
    expect(await database.unsafe('on the new client')).toStrictEqual(FLAKY_ROWS);
    expect(server.clients[1]?.executed).toContain('on the new client');
    release();
    expect(await transaction).toBe('committed');
    expect(server.clients[0]?.isClosed()).toBe(true);
    expect(server.clients[0]?.closeTimeouts).toStrictEqual([1]);
  });

  test('the failure of a transaction on a retired client does not disturb the state of the new one', async () => {
    const { server, database, advance } = createHarness({
      timeoutMilliseconds: LONG_TIMEOUT_MILLISECONDS,
    });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transaction = capture(
      database.begin(async (inner) => {
        await gate;
        await inner.unsafe('late');
      }),
    );
    await settle();
    server.setMode(FLAKY_MODE.CLOSED);
    await capture(database.unsafe('x'));
    advance(500);
    await capture(database.unsafe('y'));
    server.setMode(FLAKY_MODE.HEALTHY);
    advance(1_000);
    await database.unsafe('recovered');
    server.setMode(FLAKY_MODE.CLOSED);
    release();
    expectDriverCode(await transaction, 'ERR_POSTGRES_CONNECTION_CLOSED');
    expect(database.readHealth().state).toBe('up');
  });

  test('the success of a transaction on a retired client does not mark the new client as up', async () => {
    const { server, database, advance } = createHarness({
      timeoutMilliseconds: LONG_TIMEOUT_MILLISECONDS,
    });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transaction = database.begin(async (inner) => {
      await gate;
      await inner.unsafe('late');
      return 'committed';
    });
    await settle();
    server.setMode(FLAKY_MODE.CLOSED);
    await capture(database.unsafe('x'));
    advance(500);
    await capture(database.unsafe('y'));
    expect(database.readHealth().state).toBe('down');
    server.setMode(FLAKY_MODE.HEALTHY);
    release();
    expect(await transaction).toBe('committed');
    expect(database.readHealth().state).toBe('down');
  });

  test('a unit that overran the cap does not keep the old client open', async () => {
    const { server, database } = createHarness();
    server.setMode(FLAKY_MODE.HUNG);
    await capture(database.unsafe('stuck'));
    expect(server.clients[0]?.isClosed()).toBe(true);
  });
});

describe('ResilientDatabase: close', () => {
  test('closes the current client and the retired ones still waiting for their transaction', async () => {
    const { server, database, advance } = createHarness({
      timeoutMilliseconds: LONG_TIMEOUT_MILLISECONDS,
    });
    const transaction = capture(database.begin(() => new Promise<void>(() => undefined)));
    await settle();
    server.setMode(FLAKY_MODE.CLOSED);
    await capture(database.unsafe('x'));
    advance(500);
    await capture(database.unsafe('y'));
    await database.close();
    expect(server.clients.every((client) => client.isClosed())).toBe(true);
    expectUnavailable(await transaction, 'DATABASE_QUERY_TIMEOUT');
  });

  test('after close, units that fail with CLOSED because of the close itself never reopen a client', async () => {
    const { server, database } = createHarness({ timeoutMilliseconds: LONG_TIMEOUT_MILLISECONDS });
    server.hold();
    const first = capture(database.unsafe('first'));
    const second = capture(database.unsafe('second'));
    await settle();
    await database.close();
    expectDriverCode(await first, 'ERR_POSTGRES_CONNECTION_CLOSED');
    expectDriverCode(await second, 'ERR_POSTGRES_CONNECTION_CLOSED');
    expect(server.clients).toHaveLength(1);
  });

  test('after close the gate admits nothing and never opens a client again, not even for a late unit that overruns the cap', async () => {
    const { server, database } = createHarness({ timeoutMilliseconds: LONG_TIMEOUT_MILLISECONDS });
    const late = capture(database.begin(() => new Promise<void>(() => undefined)));
    await settle();
    await database.close();
    expectUnavailable(await capture(database.unsafe('after close')), 'DATABASE_UNAVAILABLE');
    expectUnavailable(
      await capture(database.begin(() => Promise.resolve())),
      'DATABASE_UNAVAILABLE',
    );
    expectUnavailable(await late, 'DATABASE_QUERY_TIMEOUT');
    expect(server.clients).toHaveLength(1);
  });
});

describe('classification of connection failures (ADR 0002, R1)', () => {
  const { isDatabaseConnectionFailure } = connectionError;

  test.each([
    ['ERR_POSTGRES_CONNECTION_TIMEOUT', undefined],
    ['ERR_POSTGRES_EXPECTED_REQUEST', undefined],
    ['ERR_POSTGRES_CONNECTION_CLOSED', undefined],
    ['ERR_POSTGRES_CONNECTION_REFUSED', undefined],
    ['DATABASE_QUERY_TIMEOUT', undefined],
    ['ERR_POSTGRES_SERVER_ERROR', '08006'],
    ['ERR_POSTGRES_SERVER_ERROR', '08001'],
    ['ERR_POSTGRES_SERVER_ERROR', '57P01'],
    ['ERR_POSTGRES_SERVER_ERROR', '57P03'],
  ])('%s %s is a connection failure, loose or wrapped like Drizzle', (code, errno) => {
    const error = new FlakyPostgresError(code, errno);
    expect(isDatabaseConnectionFailure(error)).toBe(true);
    expect(isDatabaseConnectionFailure(wrapLikeDrizzle(error))).toBe(true);
  });

  test.each([
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EPIPE',
    'EHOSTUNREACH',
    'ENOTFOUND',
    'EAI_AGAIN',
  ])('the network code %s counts only when the driver itself carries it', (code) => {
    const fromDriver = new FlakyPostgresError(code);
    expect(isDatabaseConnectionFailure(fromDriver)).toBe(true);
    expect(isDatabaseConnectionFailure(wrapLikeDrizzle(fromDriver))).toBe(true);
    const other = Object.assign(new Error('connect failed'), { code });
    expect(isDatabaseConnectionFailure(other)).toBe(false);
    expect(isDatabaseConnectionFailure(new Error('fetch failed', { cause: other }))).toBe(false);
  });

  test('an error from another integration with a network code never takes the gate down', async () => {
    const { database } = createHarness();
    const refused = Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' });
    await capture(
      database.begin(() => Promise.reject(new Error('fetch failed', { cause: refused }))),
    );
    expect(database.readHealth()).toMatchObject({ state: 'up', consecutiveFailures: 0 });
  });

  test.each([
    ['ERR_POSTGRES_SERVER_ERROR', '23505'],
    ['ERR_POSTGRES_SERVER_ERROR', '53300'],
    ['ERR_POSTGRES_SERVER_ERROR', '57014'],
    ['ERR_POSTGRES_SERVER_ERROR', undefined],
  ])('%s %s is an error of the query, not of the connection', (code, errno) => {
    expect(isDatabaseConnectionFailure(new FlakyPostgresError(code, errno))).toBe(false);
  });
});
