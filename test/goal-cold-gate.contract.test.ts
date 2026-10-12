// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createOwnerScope,
  type OwnerScope,
} from '../packages/database/src/ownership/owner-scope.js';
import { userIdFromDatabase } from '../packages/database/src/ownership/user-id.js';
import { createColdEvaluationGate } from '../apps/api-ativada/src/goals/goal-cold-gate.js';
import { createGoalColdBudget } from '../apps/api-ativada/src/goals/goal-cold-budget.js';
import {
  GoalEvaluationBusyError,
  GoalEvaluationTimeoutError,
} from '../apps/api-ativada/src/goals/goal.error.js';
import {
  RATE_LIMIT_POLICY,
  type RateLimitPolicy,
} from '../apps/api-ativada/src/rate-limit/rate-limit-policy.constant.js';
import { RateLimitedError } from '../apps/api-ativada/src/rate-limit/rate-limited.error.js';
import { createRateLimiter } from '../apps/api-ativada/src/rate-limit/rate-limiter.js';

const scopeOf = (id: string): OwnerScope => createOwnerScope(userIdFromDatabase(id));
const USER_A = scopeOf('0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d11');
const USER_B = scopeOf('0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d12');
const USER_C = scopeOf('0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d13');

type Deferred = {
  readonly promise: Promise<string>;
  readonly resolve: (value: string) => void;
  readonly reject: (reason: Error) => void;
};

function defer(): Deferred {
  let resolve: Deferred['resolve'] = () => undefined;
  let reject: Deferred['reject'] = () => undefined;
  const promise = new Promise<string>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function createCountingBudget(): {
  readonly charges: OwnerScope[];
  readonly budget: { readonly charge: (scope: OwnerScope) => void };
} {
  const charges: OwnerScope[] = [];
  return { charges, budget: { charge: (scope): void => void charges.push(scope) } };
}

async function expectRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  throw new Error('a promessa deveria ter sido rejeitada');
}

describe('portão das avaliações a frio de metas', () => {
  test('cobra o orçamento UMA vez por avaliação e devolve o resultado do trabalho', async () => {
    const { charges, budget } = createCountingBudget();
    const gate = createColdEvaluationGate<string>({ maxConcurrent: 4, budget });
    expect(
      await gate.run({ scope: USER_A, signature: 'meta-1' }, () => Promise.resolve('pronto')),
    ).toBe('pronto');
    expect(charges).toStrictEqual([USER_A]);
  });

  test('single-flight: o mesmo usuário com a MESMA meta divide a avaliação em voo, sem cobrar nem rodar duas vezes', async () => {
    const { charges, budget } = createCountingBudget();
    const gate = createColdEvaluationGate<string>({ maxConcurrent: 4, budget });
    const work = defer();
    let started = 0;
    const first = gate.run({ scope: USER_A, signature: 'meta-1' }, () => {
      started += 1;
      return work.promise;
    });
    const second = gate.run({ scope: USER_A, signature: 'meta-1' }, () => {
      started += 1;
      return work.promise;
    });
    work.resolve('uma só');
    expect(await Promise.all([first, second])).toStrictEqual(['uma só', 'uma só']);
    expect(started).toBe(1);
    expect(charges).toHaveLength(1);
  });

  test('single-flight: outra meta do mesmo usuário enquanto uma avaliação voa é 429 com Retry-After', async () => {
    const { charges, budget } = createCountingBudget();
    const gate = createColdEvaluationGate<string>({ maxConcurrent: 4, budget });
    const work = defer();
    const first = gate.run({ scope: USER_A, signature: 'meta-1' }, () => work.promise);
    const error = await expectRejection(
      gate.run({ scope: USER_A, signature: 'meta-2' }, () => Promise.resolve('x')),
    );
    expect(error).toBeInstanceOf(RateLimitedError);
    expect((error as RateLimitedError).headers['Retry-After']).toBe('1');
    expect(charges).toHaveLength(1);
    work.resolve('ok');
    await first;
  });

  test('o teto global recusa com 503 e Retry-After, sem gastar o orçamento de quem foi recusado', async () => {
    const { charges, budget } = createCountingBudget();
    const gate = createColdEvaluationGate<string>({ maxConcurrent: 2, budget });
    const holdA = defer();
    const holdB = defer();
    const inFlightA = gate.run({ scope: USER_A, signature: 'a' }, () => holdA.promise);
    const inFlightB = gate.run({ scope: USER_B, signature: 'b' }, () => holdB.promise);
    const error = await expectRejection(
      gate.run({ scope: USER_C, signature: 'c' }, () => Promise.resolve('x')),
    );
    expect(error).toBeInstanceOf(GoalEvaluationBusyError);
    expect((error as GoalEvaluationBusyError).status).toBe(503);
    expect(Number((error as GoalEvaluationBusyError).headers['Retry-After'])).toBeGreaterThan(0);
    expect(charges).toHaveLength(2);
    holdA.resolve('a');
    holdB.resolve('b');
    await Promise.all([inFlightA, inFlightB]);
  });

  test('terminar libera a vaga, com sucesso ou com falha, e o mesmo usuário pode avaliar de novo', async () => {
    const { budget } = createCountingBudget();
    const gate = createColdEvaluationGate<string>({ maxConcurrent: 1, budget });
    const failure = await expectRejection(
      gate.run({ scope: USER_A, signature: 'a' }, () => Promise.reject(new Error('quebrou'))),
    );
    expect((failure as Error).message).toBe('quebrou');
    expect(
      await gate.run({ scope: USER_A, signature: 'a' }, () => Promise.resolve('de novo')),
    ).toBe('de novo');
    const timeout = await expectRejection(
      gate.run({ scope: USER_B, signature: 'b' }, () =>
        Promise.reject(new GoalEvaluationTimeoutError()),
      ),
    );
    expect(timeout).toBeInstanceOf(GoalEvaluationTimeoutError);
    expect(await gate.run({ scope: USER_B, signature: 'b' }, () => Promise.resolve('livre'))).toBe(
      'livre',
    );
  });

  test('orçamento esgotado: o erro do orçamento sobe e nada fica em voo', async () => {
    const exhausted = new RateLimitedError(7);
    const gate = createColdEvaluationGate<string>({
      maxConcurrent: 1,
      budget: {
        charge: (): void => {
          throw exhausted;
        },
      },
    });
    expect(
      await expectRejection(
        gate.run({ scope: USER_A, signature: 'a' }, () => Promise.resolve('x')),
      ),
    ).toBe(exhausted);
    const open = createColdEvaluationGate<string>({
      maxConcurrent: 1,
      budget: createCountingBudget().budget,
    });
    expect(await open.run({ scope: USER_A, signature: 'a' }, () => Promise.resolve('ok'))).toBe(
      'ok',
    );
  });
});

describe('orçamento das avaliações a frio (3 por minuto por usuário)', () => {
  const POLICY: RateLimitPolicy = RATE_LIMIT_POLICY.GOAL_EVALUATION_COLD;

  test('a política é própria, por usuário, 3 por minuto', () => {
    expect(POLICY.limit).toBe(3);
    expect(POLICY.windowMilliseconds).toBe(60_000);
    expect(POLICY.keyScope).toBe('subject');
    expect(POLICY.name).not.toBe(RATE_LIMIT_POLICY.GOAL_EVALUATION.name);
  });

  test('a quarta cobrança no mesmo minuto é 429 com Retry-After, e cada usuário tem a sua', () => {
    const clock = { now: 1_000_000 };
    const budget = createGoalColdBudget({
      rateLimiter: createRateLimiter({ now: () => clock.now }),
    });
    for (let charge = 0; charge < 3; charge += 1) budget.charge(USER_A);
    let caught: unknown;
    try {
      budget.charge(USER_A);
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RateLimitedError);
    expect(Number((caught as RateLimitedError).headers['Retry-After'])).toBeGreaterThan(0);
    expect(() => budget.charge(USER_B)).not.toThrow();
    clock.now += 21_000;
    expect(() => budget.charge(USER_A)).not.toThrow();
  });
});
