// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { EnvironmentError, parseEnvironment } from '../packages/environment/src/index.js';
import { loadStreamApp } from './fixtures/stream/stream-app.fixture.js';
import { readEnvironmentFile } from './fixtures/environment-file.fixture.js';

const { environment: streamEnvironment, apiEnvironment } = await loadStreamApp();
const { environmentSchema } = apiEnvironment;

async function issuesOf(overrides: Record<string, string>): Promise<string> {
  const base = await readEnvironmentFile('env.test');
  try {
    parseEnvironment(environmentSchema, { ...base, ...overrides });
  } catch (error: unknown) {
    return error instanceof EnvironmentError ? error.issues.join('\n') : 'outro erro';
  }
  return '';
}

describe('stream environment — the WebSocket ceilings', () => {
  test('the defaults are 5 sockets per user, 4 KiB messages, ping 20 s, pong 60 s, 60 messages a minute', async () => {
    const base = await readEnvironmentFile('env.test');
    const environment = parseEnvironment(environmentSchema, base);
    expect(streamEnvironment.toStreamLimits(environment)).toStrictEqual({
      maxSocketsPerUser: 5,
      maxMessageBytes: 4_096,
      pongTimeoutMilliseconds: 60_000,
      maxMessagesPerMinute: 60,
    });
    expect(environment.STREAM_PING_INTERVAL_SECONDS).toBe(20);
  });

  test('accepts overrides inside the bounds', async () => {
    const base = await readEnvironmentFile('env.test');
    const environment = parseEnvironment(environmentSchema, {
      ...base,
      STREAM_MAX_SOCKETS_PER_USER: '2',
      STREAM_MAX_MESSAGE_BYTES: '1024',
      STREAM_PING_INTERVAL_SECONDS: '10',
      STREAM_PONG_TIMEOUT_SECONDS: '30',
      STREAM_MAX_MESSAGES_PER_MINUTE: '20',
    });
    expect(streamEnvironment.toStreamLimits(environment)).toStrictEqual({
      maxSocketsPerUser: 2,
      maxMessageBytes: 1_024,
      pongTimeoutMilliseconds: 30_000,
      maxMessagesPerMinute: 20,
    });
  });

  test.each([
    ['STREAM_MAX_SOCKETS_PER_USER', '0'],
    ['STREAM_MAX_SOCKETS_PER_USER', '51'],
    ['STREAM_MAX_MESSAGE_BYTES', '255'],
    ['STREAM_MAX_MESSAGE_BYTES', '65537'],
    ['STREAM_PING_INTERVAL_SECONDS', '4'],
    ['STREAM_PONG_TIMEOUT_SECONDS', '601'],
    ['STREAM_MAX_MESSAGES_PER_MINUTE', '9'],
    ['STREAM_MAX_SOCKETS_PER_USER', 'muitos'],
  ])('%s=%s is refused at boot, naming the variable', async (variable, value) => {
    expect(await issuesOf({ [variable]: value })).toContain(variable);
  });

  test('the pong timeout must be longer than the ping interval', async () => {
    const issues = await issuesOf({
      STREAM_PING_INTERVAL_SECONDS: '30',
      STREAM_PONG_TIMEOUT_SECONDS: '30',
    });
    expect(issues).toContain('STREAM_PONG_TIMEOUT_SECONDS');
  });
});
