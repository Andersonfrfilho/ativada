// Copyright (c) 2026 Ada Technology. All rights reserved.
import { beforeAll, describe, expect, test } from 'bun:test';

import {
  createOwnerScope,
  type OwnerScope,
} from '../packages/database/src/ownership/owner-scope.js';
import { userIdFromDatabase } from '../packages/database/src/ownership/user-id.js';
import { loadApiApp, type ApiApp } from './fixtures/api-routes/api-app.fixture.js';

const scopeOf = (id: string): OwnerScope => createOwnerScope(userIdFromDatabase(id));
const USER_A = scopeOf('0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d11');
const USER_B = scopeOf('0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d12');
const USER_C = scopeOf('0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d13');

let app: ApiApp;

beforeAll(async () => {
  app = await loadApiApp();
});

function wire(
  maxConcurrent: number,
): ReturnType<ApiApp['coldWiring']['createColdEvaluationWiring']> {
  return app.coldWiring.createColdEvaluationWiring({
    environment: { GOAL_EVALUATION_MAX_CONCURRENT: maxConcurrent },
    rateLimiter: app.rateLimiter.createRateLimiter({ now: () => 0 }),
  });
}

function hold(): { readonly promise: Promise<never>; readonly release: () => void } {
  let release = (): void => undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    release = (): void => reject(new Error('solto'));
  });
  promise.catch(() => undefined);
  return { promise, release };
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  throw new Error('a promessa deveria ter sido rejeitada');
}

describe('metas e prazos dividem o MESMO portão a frio (RNF01)', () => {
  test('uma meta a frio em voo recusa o prazo a frio do mesmo usuário com o 429 do portão', async () => {
    const { goalGate, horizonGate } = wire(8);
    const inFlight = hold();
    const goal = goalGate.run({ scope: USER_A, signature: 'meta' }, () => inFlight.promise);
    const error = await rejectionOf(
      horizonGate.run({ scope: USER_A, signature: 'prazo' }, () => Promise.reject(new Error('x'))),
    );
    expect(error).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    inFlight.release();
    await rejectionOf(goal);
  });

  test('um prazo a frio em voo recusa a meta a frio do mesmo usuário', async () => {
    const { goalGate, horizonGate } = wire(8);
    const inFlight = hold();
    const horizon = horizonGate.run({ scope: USER_A, signature: 'prazo' }, () => inFlight.promise);
    const error = await rejectionOf(
      goalGate.run({ scope: USER_A, signature: 'meta' }, () => Promise.reject(new Error('x'))),
    );
    expect(error).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    inFlight.release();
    await rejectionOf(horizon);
  });

  test('o teto global conta metas e prazos juntos (503)', async () => {
    const { goalGate, horizonGate } = wire(2);
    const holdGoal = hold();
    const holdHorizon = hold();
    const goal = goalGate.run({ scope: USER_A, signature: 'meta' }, () => holdGoal.promise);
    const horizon = horizonGate.run(
      { scope: USER_B, signature: 'prazo' },
      () => holdHorizon.promise,
    );
    const error = await rejectionOf(
      horizonGate.run({ scope: USER_C, signature: 'outro' }, () => Promise.reject(new Error('x'))),
    );
    expect(error).toMatchObject({ status: 503, code: 'GOAL_EVALUATION_BUSY' });
    holdGoal.release();
    holdHorizon.release();
    await rejectionOf(goal);
    await rejectionOf(horizon);
  });

  test('terminada a avaliação, a vaga do usuário volta para o outro tipo', async () => {
    const { goalGate, horizonGate } = wire(8);
    await goalGate.run({ scope: USER_A, signature: 'meta' }, () =>
      Promise.resolve(undefined as never),
    );
    const release = hold();
    const horizon = horizonGate.run({ scope: USER_A, signature: 'prazo' }, () => release.promise);
    release.release();
    expect(await rejectionOf(horizon)).toStrictEqual(new Error('solto'));
  });
});
