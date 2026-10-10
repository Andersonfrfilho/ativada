// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { SessionEnd } from '../packages/database/src/notifications/session-end.js';
import type { Logger } from '../apps/api-cryptoada/src/logging/logger.js';
import {
  logListenerLoss,
  toListenerHealth,
} from '../apps/api-cryptoada/src/stream/listener-health.js';

describe('toListenerHealth', () => {
  test('a listening listener is up, with no reason', () => {
    expect(
      toListenerHealth({ isListening: () => true, fatalReason: () => undefined }),
    ).toStrictEqual({
      state: 'up',
      reason: null,
    });
  });

  test('a fatal reason is failed and carries only the reason code', () => {
    const health = toListenerHealth({
      isListening: () => false,
      fatalReason: () => 'authentication_failed',
    });
    expect(health).toStrictEqual({ state: 'failed', reason: 'authentication_failed' });
  });

  test('not listening without a fatal reason is reconnecting', () => {
    expect(
      toListenerHealth({ isListening: () => false, fatalReason: () => undefined }),
    ).toStrictEqual({
      state: 'reconnecting',
      reason: null,
    });
  });

  test('a listener that was not opened yet is reconnecting', () => {
    expect(toListenerHealth(undefined)).toStrictEqual({ state: 'reconnecting', reason: null });
  });
});

describe('logListenerLoss', () => {
  function recordingLogger(): { readonly logger: Logger; readonly calls: [string, unknown][] } {
    const calls: [string, unknown][] = [];
    const record =
      (level: string): Logger['info'] =>
      (_message, fields) =>
        void calls.push([level, fields]);
    return {
      calls,
      logger: {
        debug: record('debug'),
        info: record('info'),
        warn: record('warn'),
        error: record('error'),
      },
    };
  }

  test.each(['authentication_failed', 'unsupported_authentication', 'tls_unavailable'] as const)(
    '%s is logged as an error, with the reason and no secret',
    (reason) => {
      const { logger, calls } = recordingLogger();
      const end: SessionEnd = { reason, sqlState: '28P01', wasListening: false };
      logListenerLoss(logger, end);
      expect(calls).toStrictEqual([
        [
          'error',
          { event: 'stream.listener.lost', reason, sqlState: '28P01', wasListening: false },
        ],
      ]);
    },
  );

  test.each(['connection_failed', 'closed_by_server', 'unresponsive'] as const)(
    '%s stays a warning',
    (reason) => {
      const { logger, calls } = recordingLogger();
      logListenerLoss(logger, { reason, sqlState: undefined, wasListening: true });
      expect(calls.map(([level]) => level)).toStrictEqual(['warn']);
    },
  );
});
