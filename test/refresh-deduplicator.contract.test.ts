// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { createRefreshDeduplicator } from '../apps/api-cryptoada/src/session/refresh-deduplicator.js';

const WINDOW_MILLISECONDS = 10_000;

function createSubject(): {
  deduplicator: ReturnType<typeof createRefreshDeduplicator<string>>;
  advance: (ms: number) => void;
  performed: string[];
} {
  let nowMilliseconds = 0;
  const performed: string[] = [];
  return {
    deduplicator: createRefreshDeduplicator<string>({
      now: () => nowMilliseconds,
      windowMilliseconds: WINDOW_MILLISECONDS,
    }),
    advance: (milliseconds): void => {
      nowMilliseconds += milliseconds;
    },
    performed,
  };
}

describe('refresh deduplicator', () => {
  test('concurrent calls with the same token perform once and share the outcome', async () => {
    const { deduplicator, performed } = createSubject();
    const run = (): Promise<string> =>
      deduplicator.run({
        refreshToken: 'same',
        perform: async () => {
          performed.push('exchange');
          await Bun.sleep(20);
          return 'pair';
        },
        shouldRetain: () => true,
      });
    expect(await Promise.all([run(), run()])).toStrictEqual(['pair', 'pair']);
    expect(performed).toHaveLength(1);
  });

  test('different tokens are never shared', async () => {
    const { deduplicator, performed } = createSubject();
    for (const refreshToken of ['one', 'two']) {
      await deduplicator.run({
        refreshToken,
        perform: () => {
          performed.push(refreshToken);
          return Promise.resolve(refreshToken);
        },
        shouldRetain: () => true,
      });
    }
    expect(performed).toStrictEqual(['one', 'two']);
  });

  test('the outcome is reused inside the window and dropped after it', async () => {
    const { deduplicator, advance, performed } = createSubject();
    const run = (): Promise<string> =>
      deduplicator.run({
        refreshToken: 'token',
        perform: () => {
          performed.push('exchange');
          return Promise.resolve('pair');
        },
        shouldRetain: () => true,
      });
    await run();
    advance(WINDOW_MILLISECONDS - 1);
    await run();
    expect(performed).toHaveLength(1);
    advance(1);
    await run();
    expect(performed).toHaveLength(2);
  });

  test('an outcome that must not be retained is performed again, and so is a rejection', async () => {
    const { deduplicator, performed } = createSubject();
    const attempt = (perform: () => Promise<string>): Promise<string> =>
      deduplicator.run({ refreshToken: 'token', perform, shouldRetain: () => false });
    await attempt(() => Promise.resolve('failure'));
    await attempt(() => Promise.reject(new Error('network'))).catch(() => undefined);
    await attempt(() => {
      performed.push('third');
      return Promise.resolve('ok');
    });
    expect(performed).toStrictEqual(['third']);
  });
});
