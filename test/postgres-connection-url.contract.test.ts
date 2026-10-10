// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadDatabaseListenerApi } from './fixtures/postgres-wire/database-source.fixture.js';

const { connectionUrl } = await loadDatabaseListenerApi();
const { InvalidConnectionUrlError, parseConnectionUrl, SSL_MODE } = connectionUrl;

describe('postgres connection URL', () => {
  test('reads host, port, user, password and database', () => {
    expect(parseConnectionUrl('postgres://app:segredo@db.example:6543/crypto')).toStrictEqual({
      host: 'db.example',
      port: 6543,
      user: 'app',
      password: 'segredo',
      database: 'crypto',
      sslMode: SSL_MODE.PREFER,
    });
  });

  test('defaults the port to 5432 and accepts postgresql://', () => {
    const settings = parseConnectionUrl('postgresql://u:p@127.0.0.1/d');
    expect(settings.port).toBe(5432);
    expect(settings.host).toBe('127.0.0.1');
  });

  test('percent-decodes user and password', () => {
    const settings = parseConnectionUrl('postgres://us%40er:p%3Ass%2Fw@h/d');
    expect(settings.user).toBe('us@er');
    expect(settings.password).toBe('p:ss/w');
  });

  test.each([
    ['disable', SSL_MODE.DISABLE],
    ['allow', SSL_MODE.PREFER],
    ['prefer', SSL_MODE.PREFER],
    ['require', SSL_MODE.REQUIRE],
    ['verify-ca', SSL_MODE.VERIFY],
    ['verify-full', SSL_MODE.VERIFY],
  ])('sslmode=%s maps to %s', (value, expected) => {
    expect(parseConnectionUrl(`postgres://u:p@h/d?sslmode=${value}`).sslMode).toBe(expected);
  });

  test('an unknown sslmode is an error, never a silent downgrade', () => {
    expect(() => parseConnectionUrl('postgres://u:p@h/d?sslmode=talvez')).toThrow(
      InvalidConnectionUrlError,
    );
  });

  test('rejects a URL without user, database or with another scheme — without echoing the URL', () => {
    for (const url of ['postgres://h/d', 'postgres://u:p@h', 'mysql://u:p@h/d', 'isso nao e url']) {
      let message = '';
      try {
        parseConnectionUrl(url);
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(InvalidConnectionUrlError);
        message = error instanceof Error ? error.message : '';
      }
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toContain('mysql');
      expect(message).not.toContain(url);
    }
  });
});
