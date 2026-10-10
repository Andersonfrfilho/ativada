// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  compareClaimCandidates,
  hasCapacity,
  type ClaimCandidate,
} from '../packages/database/src/run-queue/claim-policy.js';
import { DEFAULT_RUN_LIMITS } from '../packages/database/src/run-queue/run-queue.constant.js';
import { readUserRunLimits } from '../packages/database/src/run-queue/run-limits.js';
import { RUN_KIND, type RunKind } from '../packages/database/src/runs/run.constant.js';

const DEFAULT_LIMITS = readUserRunLimits(undefined);

describe('tetos por usuário lidos de users.limits (RF00b)', () => {
  test('os padrões: 2 backtests, 1 walk-forward, 5 simulações ao vivo', () => {
    expect(DEFAULT_LIMITS).toStrictEqual({
      maxConcurrentBacktests: 2,
      maxConcurrentWalkForwards: 1,
      maxActiveLivePaperRuns: 5,
    });
    expect(DEFAULT_RUN_LIMITS).toStrictEqual(DEFAULT_LIMITS);
  });

  test.each([[undefined], [null], [[]], ['texto'], [7], [true], [{}]])(
    'ausente ou sem forma (%p) usa os padrões',
    (raw) => {
      expect(readUserRunLimits(raw)).toStrictEqual(DEFAULT_LIMITS);
    },
  );

  test('aceita inteiros positivos e ignora chaves desconhecidas', () => {
    expect(
      readUserRunLimits({
        maxConcurrentBacktests: 4,
        maxConcurrentWalkForwards: 3,
        maxActiveLivePaperRuns: 9,
        maxActivePriceAlerts: 50,
        ignorada: true,
      }),
    ).toStrictEqual({
      maxConcurrentBacktests: 4,
      maxConcurrentWalkForwards: 3,
      maxActiveLivePaperRuns: 9,
    });
  });

  test.each([[0], [-1], [1.5], ['3'], [null], [Number.NaN], [1_000_000], [[]], [{}]])(
    'limite inválido (%p) volta ao padrão SÓ naquele campo',
    (invalid) => {
      const limits = readUserRunLimits({
        maxConcurrentBacktests: invalid,
        maxConcurrentWalkForwards: 3,
      });
      expect(limits.maxConcurrentBacktests).toBe(2);
      expect(limits.maxConcurrentWalkForwards).toBe(3);
      expect(limits.maxActiveLivePaperRuns).toBe(5);
    },
  );
});

function candidate(overrides: Partial<ClaimCandidate>): ClaimCandidate {
  return {
    runId: '00000000-0000-7000-8000-000000000001',
    userId: 'user-a',
    kind: RUN_KIND.BACKTEST,
    createdMicros: 1_000n,
    lastStartedMicros: undefined,
    runningOfKind: 0,
    limits: DEFAULT_LIMITS,
    ...overrides,
  };
}

describe('capacidade por tipo', () => {
  test('backtest: até o teto de backtests do dono; walk-forward: até o de walk-forwards', () => {
    expect(hasCapacity(candidate({ runningOfKind: 1 }))).toBe(true);
    expect(hasCapacity(candidate({ runningOfKind: 2 }))).toBe(false);
    const walkForward = { kind: RUN_KIND.WALK_FORWARD as RunKind };
    expect(hasCapacity(candidate({ ...walkForward, runningOfKind: 0 }))).toBe(true);
    expect(hasCapacity(candidate({ ...walkForward, runningOfKind: 1 }))).toBe(false);
  });

  test('o teto vem do usuário', () => {
    const limits = { ...DEFAULT_LIMITS, maxConcurrentWalkForwards: 3 };
    const walkForward = { kind: RUN_KIND.WALK_FORWARD as RunKind, limits };
    expect(hasCapacity(candidate({ ...walkForward, runningOfKind: 2 }))).toBe(true);
    expect(hasCapacity(candidate({ ...walkForward, runningOfKind: 3 }))).toBe(false);
  });

  test('simulação ao vivo não é reivindicada pela fila', () => {
    expect(hasCapacity(candidate({ kind: RUN_KIND.LIVE_PAPER }))).toBe(false);
  });
});

describe('ordem de reivindicação: round-robin entre usuários', () => {
  test('quem nunca foi servido vem antes; depois, quem foi servido há mais tempo; depois a fila mais antiga', () => {
    const never = candidate({ userId: 'n', lastStartedMicros: undefined, createdMicros: 9n });
    const longAgo = candidate({ userId: 'l', lastStartedMicros: 10n, createdMicros: 1n });
    const recently = candidate({ userId: 'r', lastStartedMicros: 20n, createdMicros: 1n });
    const sorted = [recently, longAgo, never].sort(compareClaimCandidates);
    expect(sorted.map((entry) => entry.userId)).toStrictEqual(['n', 'l', 'r']);
    const older = candidate({ userId: 'o', lastStartedMicros: 5n, createdMicros: 3n });
    const newer = candidate({ userId: 'w', lastStartedMicros: 5n, createdMicros: 4n });
    expect([newer, older].sort(compareClaimCandidates)[0]?.userId).toBe('o');
  });

  test('é uma ordem total e antissimétrica (desempate pelo id)', () => {
    const first = candidate({ runId: '00000000-0000-7000-8000-000000000001' });
    const second = candidate({ runId: '00000000-0000-7000-8000-000000000002' });
    expect(compareClaimCandidates(first, second)).toBeLessThan(0);
    expect(compareClaimCandidates(second, first)).toBeGreaterThan(0);
    expect(compareClaimCandidates(first, first)).toBe(0);
  });

  test('NÃO-INANIÇÃO: 10 do usuário A e 1 do usuário B que chegou depois; B começa antes da 3ª de A', () => {
    const backlogs = new Map<string, bigint[]>([
      ['a', Array.from({ length: 10 }, (_unused, index) => BigInt(index + 1))],
      ['b', [100n]],
    ]);
    const lastStarted = new Map<string, bigint>();
    const order: string[] = [];
    for (let step = 1n; order.length < 11; step += 1n) {
      const heads = [...backlogs.entries()]
        .filter(([, queue]) => queue.length > 0)
        .map(([userId, queue]) =>
          candidate({
            userId,
            createdMicros: queue[0] ?? 0n,
            lastStartedMicros: lastStarted.get(userId),
          }),
        );
      const next = heads.sort(compareClaimCandidates)[0];
      if (next === undefined) break;
      backlogs.get(next.userId)?.shift();
      lastStarted.set(next.userId, step);
      order.push(next.userId);
    }
    expect(order.indexOf('b')).toBe(1);
    expect(order.slice(0, 4)).toStrictEqual(['a', 'b', 'a', 'a']);
  });

  test('três usuários com fila cheia se alternam', () => {
    const lastStarted = new Map<string, bigint>();
    const order: string[] = [];
    for (let step = 1n; step <= 9n; step += 1n) {
      const heads = ['a', 'b', 'c'].map((userId, index) =>
        candidate({
          userId,
          createdMicros: BigInt(index + 1),
          lastStartedMicros: lastStarted.get(userId),
        }),
      );
      const next = heads.sort(compareClaimCandidates)[0];
      if (next === undefined) break;
      lastStarted.set(next.userId, step);
      order.push(next.userId);
    }
    expect(order.join('')).toBe('abcabcabc');
  });
});
