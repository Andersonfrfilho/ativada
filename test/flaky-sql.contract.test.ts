// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createFlakyServer,
  FLAKY_MODE,
  FLAKY_ROWS,
  FLAKY_SECRET_URL,
  FLAKY_VALUES,
  FlakyPostgresError,
  wrapLikeDrizzle,
  type FlakyClient,
} from '../packages/database/test-support/flaky-sql.js';

const PENDING_MARK = 'still pending';
const SETTLE_WINDOW_MILLISECONDS = 15;

function settleOrPending(promise: PromiseLike<unknown>): Promise<unknown> {
  return Promise.race([
    Promise.resolve(promise).then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    ),
    Bun.sleep(SETTLE_WINDOW_MILLISECONDS).then(() => PENDING_MARK),
  ]);
}

async function captureError(promise: PromiseLike<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  return undefined;
}

function expectDriverError(error: unknown, code: string, errno?: string): void {
  expect(error).toBeInstanceOf(FlakyPostgresError);
  expect(error).toMatchObject({ name: 'PostgresError', code, errno });
}

function openAgainst(): {
  readonly server: ReturnType<typeof createFlakyServer>;
  readonly client: FlakyClient;
} {
  const server = createFlakyServer();
  return { server, client: server.openClient() };
}

describe('flaky-sql: healthy', () => {
  test('answers rows, answers values, and runs nothing until awaited', async () => {
    const { client } = openAgainst();
    const query = client.unsafe('select 1', []);
    expect(client.executed).toStrictEqual([]);
    expect(await query).toStrictEqual(FLAKY_ROWS);
    expect(await client.unsafe('select 1').values()).toStrictEqual(FLAKY_VALUES);
    expect(client.executed).toStrictEqual(['select 1', 'select 1']);
  });

  test('begin runs the callback with a transaction and counts it while open', async () => {
    const { client } = openAgainst();
    let during = -1;
    const result = await client.begin(async (transaction) => {
      during = client.openTransactions();
      await transaction.unsafe('select 2');
      return 'done';
    });
    expect(result).toBe('done');
    expect(during).toBe(1);
    expect(client.openTransactions()).toBe(0);
  });
});

describe('flaky-sql: modes and the errors they imitate', () => {
  test('refused: ERR_POSTGRES_CONNECTION_REFUSED on every call, and the same client heals', async () => {
    const { server, client } = openAgainst();
    server.setMode(FLAKY_MODE.REFUSED);
    expectDriverError(
      await captureError(client.unsafe('select 1')),
      'ERR_POSTGRES_CONNECTION_REFUSED',
    );
    expectDriverError(
      await captureError(client.begin(() => Promise.resolve(1))),
      'ERR_POSTGRES_CONNECTION_REFUSED',
    );
    server.setMode(FLAKY_MODE.HEALTHY);
    expect(await client.unsafe('select 1')).toStrictEqual(FLAKY_ROWS);
  });

  test('closed: an in-flight query and new ones fail with ERR_POSTGRES_CONNECTION_CLOSED', async () => {
    const { server, client } = openAgainst();
    server.hold();
    const inFlight = captureError(client.unsafe('select 1'));
    expect(await settleOrPending(client.unsafe('select 9'))).toBe(PENDING_MARK);
    server.setMode(FLAKY_MODE.CLOSED);
    expectDriverError(await inFlight, 'ERR_POSTGRES_CONNECTION_CLOSED');
    expectDriverError(
      await captureError(client.unsafe('select 1')),
      'ERR_POSTGRES_CONNECTION_CLOSED',
    );
  });

  test('stopping: query 57P01 in errno, transaction statement EXPECTED_REQUEST', async () => {
    const { server, client } = openAgainst();
    server.setMode(FLAKY_MODE.STOPPING);
    expectDriverError(
      await captureError(client.unsafe('select 1')),
      'ERR_POSTGRES_SERVER_ERROR',
      '57P01',
    );
    server.setMode(FLAKY_MODE.HEALTHY);
    const failure = await captureError(
      client.begin(async (transaction) => {
        server.setMode(FLAKY_MODE.STOPPING);
        await transaction.unsafe('select 1');
      }),
    );
    expectDriverError(failure, 'ERR_POSTGRES_EXPECTED_REQUEST');
  });

  test('stopping kills the query that was in flight with 57P01', async () => {
    const { server, client } = openAgainst();
    server.hold();
    const inFlight = captureError(client.unsafe('select 1'));
    server.setMode(FLAKY_MODE.STOPPING);
    expectDriverError(await inFlight, 'ERR_POSTGRES_SERVER_ERROR', '57P01');
  });

  test('frozen: queries hang and finish when the server thaws; a new client times out', async () => {
    const { server, client } = openAgainst();
    server.setMode(FLAKY_MODE.FROZEN);
    const hanging = Promise.resolve(client.unsafe('select 1'));
    expect(await settleOrPending(client.unsafe('select 2'))).toBe(PENDING_MARK);
    const fresh = server.openClient();
    expectDriverError(
      await captureError(fresh.unsafe('select 1')),
      'ERR_POSTGRES_CONNECTION_TIMEOUT',
    );
    server.setMode(FLAKY_MODE.HEALTHY);
    expect(await hanging).toStrictEqual(FLAKY_ROWS);
  });

  test('hung: open clients stay mute even after the server is healthy; a new client works', async () => {
    const { server, client } = openAgainst();
    server.setMode(FLAKY_MODE.HUNG);
    expect(await settleOrPending(client.unsafe('select 1'))).toBe(PENDING_MARK);
    server.setMode(FLAKY_MODE.HEALTHY);
    expect(client.isMute()).toBe(true);
    expect(await settleOrPending(client.unsafe('select 1'))).toBe(PENDING_MARK);
    const fresh = server.openClient();
    expect(await fresh.unsafe('select 1')).toStrictEqual(FLAKY_ROWS);
    expect(fresh.isMute()).toBe(false);
  });

  test('hung: a query already held when the connection goes mute does not come back with release()', async () => {
    const { server, client } = openAgainst();
    server.hold();
    const stuck = settleOrPending(client.unsafe('select 1'));
    server.setMode(FLAKY_MODE.HUNG);
    server.release();
    expect(await stuck).toBe(PENDING_MARK);
  });

  test('close() rejects what is pending on that client with CLOSED and records the timeout', async () => {
    const { server, client } = openAgainst();
    server.setMode(FLAKY_MODE.HUNG);
    const stuck = captureError(client.unsafe('select 1'));
    await client.close({ timeout: 1 });
    expectDriverError(await stuck, 'ERR_POSTGRES_CONNECTION_CLOSED');
    expect(client.isClosed()).toBe(true);
    expect(client.closeTimeouts).toStrictEqual([1]);
    expectDriverError(
      await captureError(client.unsafe('select 1')),
      'ERR_POSTGRES_CONNECTION_CLOSED',
    );
  });

  test('close() on one client does not touch another', async () => {
    const server = createFlakyServer();
    const first = server.openClient();
    const second = server.openClient();
    server.hold();
    const secondQuery = settleOrPending(second.unsafe('select 1'));
    await first.close();
    server.release();
    expect(await secondQuery).toStrictEqual({ value: FLAKY_ROWS });
  });
});

describe('flaky-sql: the shape of the errors', () => {
  test('driver errors are PostgresError with a code and a message carrying the secret', () => {
    const error = new FlakyPostgresError('ERR_POSTGRES_SERVER_ERROR', '57P01');
    expect(error.name).toBe('PostgresError');
    expect(error.errno).toBe('57P01');
    expect(error.severity).toBe('FATAL');
    expect(error.message).toContain(FLAKY_SECRET_URL);
    expect(new FlakyPostgresError('ERR_POSTGRES_CONNECTION_CLOSED').errno).toBeUndefined();
  });

  test('wrapLikeDrizzle gives name Error, the query and parameters in the message, and the driver in cause', () => {
    const driver = new FlakyPostgresError('ERR_POSTGRES_CONNECTION_CLOSED');
    const wrapped = wrapLikeDrizzle(driver, 'select * from users where email = $1', ['a@b.c']);
    expect(wrapped.name).toBe('Error');
    expect(wrapped.cause).toBe(driver);
    expect(wrapped.message).toContain('Failed query: select * from users');
    expect(wrapped.message).toContain('a@b.c');
  });
});
