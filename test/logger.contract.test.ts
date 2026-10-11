// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { createLogger } from '../apps/api-cryptoada/src/logging/logger.js';
import { RunNotFoundError } from '../apps/api-cryptoada/src/runs/run.error.js';
import { RUN_ERROR_CODE } from '../apps/api-cryptoada/src/shared/errors/error-code.constant.js';

const REDACTED = '[REDACTED]';
const SENSITIVE_VALUES: Readonly<Record<string, string>> = {
  email: 'pessoa.secreta@example.com',
  telegram_chat_id: '987654321',
  ticket: 'ticket-aleatorio-123',
  code: 'codigo-de-autorizacao-456',
  codeVerifier: 'verifier-pkce-789',
  authorization: 'Bearer eyJ.token.secreto',
  cookie: '__Host-cryptoada_refresh=refresh-secreto',
  'set-cookie': '__Host-cryptoada_refresh=outro-refresh',
  secret: 'segredo-do-cliente',
  chatId: '555000111',
  chat_id: '555000222',
  telegramChatId: '555000333',
  botToken: '123456789:token-do-bot',
};

function captureLines(): { readonly lines: string[]; readonly write: (line: string) => void } {
  const lines: string[] = [];
  return { lines, write: (line: string): void => void lines.push(line) };
}

function createCapturedLogger(): {
  readonly lines: string[];
  readonly logger: ReturnType<typeof createLogger>;
} {
  const { lines, write } = captureLines();
  return { lines, logger: createLogger({ appName: 'api-cryptoada', write }) };
}

describe('structured logger', () => {
  test('writes one JSON line with level, timestamp, app and message', () => {
    const { lines, logger } = createCapturedLogger();
    logger.info('listening', { port: 56101 });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.endsWith('\n')).toBe(true);
    const entry = JSON.parse(lines[0] ?? '') as Record<string, unknown>;
    expect(entry).toMatchObject({
      level: 'info',
      app: 'api-cryptoada',
      message: 'listening',
      port: 56101,
    });
    expect(typeof entry['timestamp']).toBe('string');
  });

  test('fields cannot overwrite level, app or message', () => {
    const { lines, logger } = createCapturedLogger();
    logger.warn('real message', { level: 'debug', app: 'other', message: 'fake' });
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({
      level: 'warn',
      app: 'api-cryptoada',
      message: 'real message',
    });
  });

  test('redacts every sensitive key and none of the values leaves the logger', () => {
    const { lines, logger } = createCapturedLogger();
    logger.error('failure', { ...SENSITIVE_VALUES });
    const output = lines.join('');
    for (const value of Object.values(SENSITIVE_VALUES)) expect(output).not.toContain(value);
    const entry = JSON.parse(output) as Record<string, unknown>;
    for (const key of Object.keys(SENSITIVE_VALUES)) expect(entry[key]).toBe(REDACTED);
  });

  test('redacts keys case-insensitively and in nested objects and arrays', () => {
    const { lines, logger } = createCapturedLogger();
    logger.info('nested', {
      request: {
        headers: { Authorization: 'Bearer abc.def.ghi', 'Set-Cookie': 'a=b', accept: 'json' },
      },
      people: [{ EMAIL: 'a@b.com', name: 'visible' }],
      CodeVerifier: 'verifier-x',
      clientSecret: 'client-secret-y',
    });
    const output = lines.join('');
    for (const leaked of ['abc.def.ghi', 'a=b', 'a@b.com', 'verifier-x', 'client-secret-y']) {
      expect(output).not.toContain(leaked);
    }
    expect(output).toContain('visible');
    expect(output).toContain('json');
  });

  test('redacts sensitive headers when a Headers object is logged', () => {
    const { lines, logger } = createCapturedLogger();
    logger.info('headers', {
      headers: new Headers({
        authorization: 'Bearer zzz.yyy.xxx',
        cookie: 'k=v',
        host: 'api.test',
      }),
    });
    const output = lines.join('');
    expect(output).not.toContain('zzz.yyy.xxx');
    expect(output).not.toContain('k=v');
    expect(output).toContain('api.test');
  });

  test('an error of our own keeps name, code, message and stack', () => {
    const { lines, logger } = createCapturedLogger();
    logger.error('unexpected', { error: new RunNotFoundError() });
    const entry = JSON.parse(lines[0] ?? '') as { error: Record<string, string> };
    expect(entry.error['name']).toBe('RunNotFoundError');
    expect(entry.error['code']).toBe(RUN_ERROR_CODE.RUN_NOT_FOUND);
    expect(entry.error['message']).toBe(new RunNotFoundError().message);
    expect(entry.error['stack']).toContain('RunNotFoundError');
  });

  describe('database errors', () => {
    const SECRET_PARAMETER = 'chat-123';

    function createDatabaseError(): Error {
      const driverError = Object.assign(
        new Error(`duplicate key value, Key (telegram_chat_id)=(${SECRET_PARAMETER})`),
        { errno: '23505' },
      );
      return Object.assign(
        new Error(
          `Failed query: update "users" set "telegram_chat_id" = $1\nparams: ${SECRET_PARAMETER}`,
        ),
        {
          query: 'update "users" set "telegram_chat_id" = $1',
          params: [SECRET_PARAMETER],
          cause: driverError,
        },
      );
    }

    test('logs only the name, the Postgres code and the trace id', () => {
      const { lines, logger } = createCapturedLogger();
      logger.error('unexpected error', { traceId: 'trace-77', error: createDatabaseError() });
      const output = lines.join('');
      expect(output).not.toContain(SECRET_PARAMETER);
      expect(output).not.toContain('Failed query');
      const entry = JSON.parse(output) as { traceId: string; error: Record<string, unknown> };
      expect(entry.traceId).toBe('trace-77');
      expect(entry.error).toStrictEqual({ name: 'DatabaseError', code: '23505' });
    });

    test('also when the error is nested in another field', () => {
      const { lines, logger } = createCapturedLogger();
      logger.error('wrapped', { details: { failure: createDatabaseError() } });
      expect(lines.join('')).not.toContain(SECRET_PARAMETER);
    });

    test('a foreign error leaves only its name and code, never message, stack or cause', () => {
      const { lines, logger } = createCapturedLogger();
      const leaked = 'https://api.telegram.org/bot123:segredo/sendMessage';
      const failure = Object.assign(new TypeError(`fetch failed ${leaked}`), {
        code: 'ECONNREFUSED',
        cause: new Error(leaked),
      });
      logger.error('plain', { error: failure });
      expect(lines.join('')).not.toContain('segredo');
      const entry = JSON.parse(lines[0] ?? '') as { error: Record<string, unknown> };
      expect(entry.error).toStrictEqual({ name: 'TypeError', code: 'ECONNREFUSED' });
    });

    test('a foreign error without a string code leaves only its name', () => {
      const { lines, logger } = createCapturedLogger();
      logger.error('plain', { error: Object.assign(new RangeError('out of range'), { code: 7 }) });
      const entry = JSON.parse(lines[0] ?? '') as { error: Record<string, unknown> };
      expect(entry.error).toStrictEqual({ name: 'RangeError' });
    });
  });

  test('survives circular references and very deep objects', () => {
    const { lines, logger } = createCapturedLogger();
    const circular: Record<string, unknown> = { name: 'loop' };
    circular['self'] = circular;
    logger.info('circular', { circular });
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ message: 'circular' });
  });
});
