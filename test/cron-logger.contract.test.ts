// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { createCronLogger } from '../apps/cron-ativada/src/logging/cron-logger.js';

const FIXED_NOW = new Date('2026-10-09T12:00:00.000Z');

describe('cron logger', () => {
  test('writes one JSON line with level, timestamp, app, message and the fields', () => {
    const lines: string[] = [];
    const logger = createCronLogger({
      appName: 'cron-ativada',
      write: (line) => void lines.push(line),
      now: () => FIXED_NOW,
    });
    logger.info('finished', { examined: 3, isOk: true });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.endsWith('\n')).toBe(true);
    expect(JSON.parse(lines[0] ?? '')).toStrictEqual({
      examined: 3,
      isOk: true,
      level: 'info',
      timestamp: FIXED_NOW.toISOString(),
      app: 'cron-ativada',
      message: 'finished',
    });
  });

  test('a field can never overwrite the level, the app or the message', () => {
    const lines: string[] = [];
    const logger = createCronLogger({
      appName: 'cron-ativada',
      write: (line) => void lines.push(line),
    });
    logger.error('failed', { level: 'info', app: 'other', message: 'spoofed' });
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({
      level: 'error',
      app: 'cron-ativada',
      message: 'failed',
    });
  });
});
