// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadDatabaseConnectionApi } from './fixtures/database-connection/database-connection-source.fixture.js';

const { outageLog, safeFields } = await loadDatabaseConnectionApi();
const { createOutageLog } = outageLog;
const { readSafeErrorFields } = safeFields;

const SECRET_URL = 'postgres://ativada:s3cret-pw@db.internal:5432/ativada';
const SECRET_PARAMETER = 'user-email@example.com';

class FakePostgresError extends Error {
  override readonly name = 'PostgresError';
  readonly code: string;
  readonly errno: string | undefined;

  constructor(code: string, errno?: string) {
    super(`connect failed for ${SECRET_URL}`);
    this.code = code;
    this.errno = errno;
  }
}

function wrapLikeDrizzle(cause: unknown): Error {
  return new Error(`Failed query: select 1 params: ${SECRET_PARAMETER}`, { cause });
}

const CLOSED = new FakePostgresError('ERR_POSTGRES_CONNECTION_CLOSED');

describe('readSafeErrorFields', () => {
  test('reads name, code and errno from the innermost error that has a code', () => {
    const error = wrapLikeDrizzle(new FakePostgresError('ERR_POSTGRES_SERVER_ERROR', '57P01'));
    expect(readSafeErrorFields(error)).toStrictEqual({
      errorName: 'PostgresError',
      code: 'ERR_POSTGRES_SERVER_ERROR',
      errno: '57P01',
    });
  });

  test('a bare driver error and a numeric errno work too', () => {
    expect(readSafeErrorFields(CLOSED).code).toBe('ERR_POSTGRES_CONNECTION_CLOSED');
    const numeric = Object.assign(new Error('x'), { code: 'ECONNREFUSED', errno: -111 });
    expect(readSafeErrorFields(numeric)).toStrictEqual({
      errorName: 'Error',
      code: 'ECONNREFUSED',
      errno: '-111',
    });
  });

  test('walks at most 4 levels of cause', () => {
    const deep = wrapLikeDrizzle(wrapLikeDrizzle(wrapLikeDrizzle(wrapLikeDrizzle(CLOSED))));
    expect(readSafeErrorFields(deep).code).toBe('UNKNOWN');
    const reachable = wrapLikeDrizzle(wrapLikeDrizzle(wrapLikeDrizzle(CLOSED)));
    expect(readSafeErrorFields(reachable).code).toBe('ERR_POSTGRES_CONNECTION_CLOSED');
  });

  test('anything that is not a plain token is dropped, never echoed', () => {
    const hostile = Object.assign(new Error('x'), { code: SECRET_URL, errno: SECRET_PARAMETER });
    const fields = readSafeErrorFields(hostile);
    expect(fields.code).toBe('UNKNOWN');
    expect(fields.errno).toBeUndefined();
    expect(JSON.stringify(fields)).not.toContain('s3cret');
  });

  test('non-error values give the unknown fields', () => {
    for (const value of [undefined, null, 'text', 42]) {
      expect(readSafeErrorFields(value)).toStrictEqual({
        errorName: 'UnknownError',
        code: 'UNKNOWN',
        errno: undefined,
      });
    }
  });
});

describe('createOutageLog', () => {
  test('the first failure logs one line with code, failures 1 and sinceMs 0', () => {
    const log = createOutageLog();
    expect(log.recordFailure({ error: wrapLikeDrizzle(CLOSED), nowMilliseconds: 1_000 })).toEqual({
      level: 'error',
      message: 'database unavailable',
      fields: { code: 'ERR_POSTGRES_CONNECTION_CLOSED', failures: 1, sinceMs: 0 },
    });
  });

  test('the errno is part of the line when the server gave one', () => {
    const log = createOutageLog();
    const entry = log.recordFailure({
      error: wrapLikeDrizzle(new FakePostgresError('ERR_POSTGRES_SERVER_ERROR', '57P01')),
      nowMilliseconds: 0,
    });
    expect(entry?.fields).toEqual({
      code: 'ERR_POSTGRES_SERVER_ERROR',
      errno: '57P01',
      failures: 1,
      sinceMs: 0,
    });
  });

  test('after the first line, failures inside 60 s are silent and the next summary is at 60 s', () => {
    const log = createOutageLog();
    log.recordFailure({ error: CLOSED, nowMilliseconds: 0 });
    expect(log.recordFailure({ error: CLOSED, nowMilliseconds: 30_000 })).toBeUndefined();
    expect(log.recordFailure({ error: CLOSED, nowMilliseconds: 59_999 })).toBeUndefined();
    const summary = log.recordFailure({ error: CLOSED, nowMilliseconds: 60_000 });
    expect(summary?.fields).toEqual({
      code: 'ERR_POSTGRES_CONNECTION_CLOSED',
      failures: 4,
      sinceMs: 60_000,
    });
    expect(log.recordFailure({ error: CLOSED, nowMilliseconds: 119_999 })).toBeUndefined();
    expect(log.recordFailure({ error: CLOSED, nowMilliseconds: 120_000 })?.fields['sinceMs']).toBe(
      120_000,
    );
  });

  test('1000 failures one second apart give one line per 60 s, then the recovery line', () => {
    const log = createOutageLog();
    const lines = [];
    for (let second = 0; second < 1_000; second += 1) {
      const entry = log.recordFailure({ error: CLOSED, nowMilliseconds: second * 1_000 });
      if (entry !== undefined) lines.push(entry);
    }
    expect(lines).toHaveLength(17);
    expect(lines.every((line) => line.fields['code'] === 'ERR_POSTGRES_CONNECTION_CLOSED')).toBe(
      true,
    );
    const recovered = log.recordRecovery(1_000_000);
    expect(recovered).toEqual({
      level: 'info',
      message: 'database recovered',
      fields: { downtimeMs: 1_000_000, failures: 1_000 },
    });
    expect(log.recordRecovery(1_001_000)).toBeUndefined();
  });

  test('a recovery without a logged outage logs nothing', () => {
    expect(createOutageLog().recordRecovery(5)).toBeUndefined();
  });

  test('a new outage after the recovery starts over with a first line', () => {
    const log = createOutageLog();
    log.recordFailure({ error: CLOSED, nowMilliseconds: 0 });
    log.recordRecovery(10);
    const entry = log.recordFailure({ error: CLOSED, nowMilliseconds: 20 });
    expect(entry?.fields).toMatchObject({ failures: 1, sinceMs: 0 });
  });

  test('the raw message, the URL, the password and the query parameters never leave', () => {
    const log = createOutageLog(1);
    const lines = [
      log.recordFailure({
        error: wrapLikeDrizzle(new FakePostgresError('ERR_X')),
        nowMilliseconds: 0,
      }),
      log.recordFailure({ error: new FakePostgresError('ERR_X'), nowMilliseconds: 5 }),
      log.recordFailure({ error: new Error(SECRET_URL), nowMilliseconds: 10 }),
      log.recordRecovery(20),
    ];
    const text = JSON.stringify(lines);
    for (const forbidden of [
      's3cret',
      'postgres://',
      SECRET_PARAMETER,
      'connect failed',
      'select',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  test('every failure line carries a code, even for an error without one', () => {
    const entry = createOutageLog().recordFailure({
      error: new Error('boom'),
      nowMilliseconds: 0,
    });
    expect(entry?.fields['code']).toBe('UNKNOWN');
  });
});
