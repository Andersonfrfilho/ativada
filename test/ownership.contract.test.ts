// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  PgDialect,
  pgTable,
  uuid,
} from '../packages/database/node_modules/drizzle-orm/pg-core/index.js';
import { InvalidUserIdError } from '../packages/database/src/ownership/invalid-user-id.error.js';
import {
  createOwnerScope,
  ownerCondition,
  type OwnerScope,
} from '../packages/database/src/ownership/owner-scope.js';
import { userIdFromDatabase } from '../packages/database/src/ownership/user-id.js';
import {
  ACCESS_OUTCOME,
  expectOtherUserGetsNotFound,
  type AccessOutcome,
  type CrossOwnerContract,
} from './fixtures/cross-owner-access.fixture.js';
import {
  createInMemoryStrategyRepository,
  OWNER_FILTER_DEFECT,
  type OwnerFilterDefect,
} from './fixtures/in-memory-strategy-repository.fixture.js';

const REPOSITORY_ROOT: string = new URL('../', import.meta.url).pathname;
const SAMPLE_USER_ID_TEXT = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d0e';
const OWNERSHIP_MINTING_PATTERN = /\buserIdFromDatabase\b|\bas\s+UserId\b|\bas\s+OwnerScope\b/;

function createRandomOwnerScope(): OwnerScope {
  return createOwnerScope(userIdFromDatabase(crypto.randomUUID()));
}

function toOutcome(isFound: boolean): AccessOutcome {
  return isFound ? ACCESS_OUTCOME.GRANTED : ACCESS_OUTCOME.NOT_FOUND;
}

async function captureFailure(pendingCheck: Promise<void>): Promise<unknown> {
  try {
    await pendingCheck;
    return undefined;
  } catch (error) {
    return error;
  }
}

function buildStrategyContract(defect: OwnerFilterDefect): CrossOwnerContract {
  const repository = createInMemoryStrategyRepository(defect);
  return {
    ownerScope: createRandomOwnerScope(),
    otherUserScope: createRandomOwnerScope(),
    createResource: (scope) => repository.create(scope, 'Placar clássico'),
    readResource: (scope, strategyId) => repository.findById(scope, strategyId),
    listResources: (scope) => repository.list(scope),
    attempts: {
      read: async (scope, strategyId) =>
        toOutcome((await repository.findById(scope, strategyId)) !== undefined),
      rename: async (scope, strategyId) =>
        toOutcome(await repository.rename(scope, { strategyId, name: 'Renomeada por outro' })),
      stop: async (scope, strategyId) => toOutcome(await repository.stop(scope, strategyId)),
      export: async (scope, strategyId) =>
        toOutcome((await repository.findById(scope, strategyId)) !== undefined),
    },
  };
}

describe('ownership contract', () => {
  test('the owner sees the resource and another user gets not found on every operation', async () => {
    await expectOtherUserGetsNotFound(buildStrategyContract(OWNER_FILTER_DEFECT.NONE));
  });

  test('the harness treats null from readResource as not found', async () => {
    const contract = buildStrategyContract(OWNER_FILTER_DEFECT.NONE);
    const repositoryRead = contract.readResource;
    await expectOtherUserGetsNotFound({
      ...contract,
      readResource: async (scope, strategyId) => (await repositoryRead(scope, strategyId)) ?? null,
    });
  });

  test.each([
    OWNER_FILTER_DEFECT.READ_IGNORES_OWNER,
    OWNER_FILTER_DEFECT.LIST_IGNORES_OWNER,
    OWNER_FILTER_DEFECT.RENAME_IGNORES_OWNER,
    OWNER_FILTER_DEFECT.STOP_WRITES_BEFORE_CHECK,
    OWNER_FILTER_DEFECT.STOP_AFFECTS_EVERY_OWNER,
  ])('the harness fails a repository whose defect is %s', async (defect) => {
    const failure = await captureFailure(
      expectOtherUserGetsNotFound(buildStrategyContract(defect)),
    );
    expect(failure).toBeInstanceOf(Error);
  });

  test('a repository call without a genuine owner scope does not compile', () => {
    const repository = createInMemoryStrategyRepository(OWNER_FILTER_DEFECT.NONE);
    const forgedScope = { ownerUserId: userIdFromDatabase(SAMPLE_USER_ID_TEXT) };
    const compileOnlyCalls: readonly (() => Promise<unknown>)[] = [
      (): Promise<unknown> =>
        // @ts-expect-error: sem escopo do dono a chamada não compila
        repository.findById('resource-id'),
      (): Promise<unknown> =>
        // @ts-expect-error: objeto montado à mão não é OwnerScope, mesmo com UserId legítimo
        repository.findById(forgedScope, 'resource-id'),
      (): Promise<unknown> =>
        // @ts-expect-error: string crua não é UserId
        repository.findById(createOwnerScope(SAMPLE_USER_ID_TEXT), 'resource-id'),
    ];
    expect(compileOnlyCalls).toHaveLength(3);
  });

  test('userIdFromDatabase accepts only lowercase UUIDs', () => {
    expect(userIdFromDatabase(SAMPLE_USER_ID_TEXT)).toBe(userIdFromDatabase(SAMPLE_USER_ID_TEXT));
    for (const invalidValue of [
      '',
      'abc',
      SAMPLE_USER_ID_TEXT.toUpperCase(),
      `${SAMPLE_USER_ID_TEXT} `,
    ]) {
      expect(() => userIdFromDatabase(invalidValue)).toThrow(InvalidUserIdError);
    }
  });

  test('owner scope is immutable', () => {
    expect(Object.isFrozen(createRandomOwnerScope())).toBe(true);
  });

  test('ownerCondition filters the user_id column by the scope owner', () => {
    const ownedProbe = pgTable('owned_probe', { userId: uuid('user_id').notNull() });
    const scope = createOwnerScope(userIdFromDatabase(SAMPLE_USER_ID_TEXT));
    const query = new PgDialect().sqlToQuery(ownerCondition(scope, ownedProbe.userId));
    expect(query).toStrictEqual({
      sql: '"owned_probe"."user_id" = $1',
      params: [SAMPLE_USER_ID_TEXT],
      typings: ['uuid'],
    });
  });

  test('UserId and OwnerScope are minted only inside packages/database', async () => {
    const glob = new Bun.Glob('{apps,packages}/*/src/**/*.{ts,tsx}');
    const offendingFiles: string[] = [];
    for await (const relativePath of glob.scan({ cwd: REPOSITORY_ROOT })) {
      if (relativePath.startsWith('packages/database/')) continue;
      const text = await Bun.file(`${REPOSITORY_ROOT}${relativePath}`).text();
      if (OWNERSHIP_MINTING_PATTERN.test(text)) offendingFiles.push(relativePath);
    }
    expect(offendingFiles).toStrictEqual([]);
  });
});
