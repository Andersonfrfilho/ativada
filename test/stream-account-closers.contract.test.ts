// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { AccountId } from '../packages/database/src/admin/admin-account-id.js';
import { parseAccountId } from '../packages/database/src/admin/admin-account-id.js';
import { createOwnerScope } from '../packages/database/src/ownership/owner-scope.js';
import { userIdFromDatabase } from '../packages/database/src/ownership/user-id.js';
import { IDENTITY_OUTCOME } from '../packages/identity-admin/src/identity-admin.constant.js';
import { loadStreamApp } from './fixtures/stream/stream-app.fixture.js';

const { blockAccount, deleteAccount } = await loadStreamApp();

type BlockDependencies = Parameters<typeof blockAccount.createBlockAccountUseCase>[0];
type DeleteDependencies = Parameters<typeof deleteAccount.createDeleteAccountUseCase>[0];
type DeleteInput = Parameters<ReturnType<typeof deleteAccount.createDeleteAccountUseCase>>[0];

const MEMBER_UUID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9e03';
const MEMBER_USER = userIdFromDatabase(MEMBER_UUID);
const parsedAccount = parseAccountId(MEMBER_UUID);
if (parsedAccount === undefined) throw new Error('identificador de conta de teste inválido');
const MEMBER_ACCOUNT: AccountId = parsedAccount;
const ADMIN = userIdFromDatabase('0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9e01');
const ACTOR = { userId: ADMIN, clientAddress: '203.0.113.9' } as const;
const ONE_SECOND = 1_000;

type Calls = string[];

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return undefined;
  } catch (error: unknown) {
    return error;
  }
}

function ok<TValue>(value: TValue): Promise<{ status: 'ok'; value: TValue }> {
  return Promise.resolve({ status: IDENTITY_OUTCOME.OK, value });
}

// O bloqueio e a exclusão derrubam o tempo real da conta (ADR 0001 §e): aqui só a ORDEM e a CONDIÇÃO desse fechamento,
// com fakes mínimos e sem HTTP — a rota inteira já é provada em `admin-block` e `account-delete`.
function blockDependencies(calls: Calls, isMissing: boolean): BlockDependencies {
  const fakes = {
    accounts: {
      findAccount: (): Promise<unknown> =>
        Promise.resolve({
          id: MEMBER_ACCOUNT,
          keycloakSubject: 'subject-member',
          createdAt: new Date(0),
          blockedAt: undefined,
          deletedAt: undefined,
        }),
      markBlocked: (): Promise<Date | undefined> => {
        calls.push('database:blocked');
        return Promise.resolve(isMissing ? undefined : new Date(0));
      },
    },
    identity: {
      readEffectiveRoles: (): Promise<unknown> => ok(['user']),
      setEnabled: (): Promise<unknown> => {
        calls.push('keycloak:disabled');
        return ok(undefined);
      },
    },
    audit: (): Promise<void> => {
      calls.push('audit');
      return Promise.resolve();
    },
    onAccountBlocked: (accountId: AccountId): void =>
      void calls.push(`sockets:closed:${accountId}`),
  };
  return fakes as unknown as BlockDependencies;
}

function deleteDependencies(calls: Calls, isMarked: boolean): DeleteDependencies {
  const fakes = {
    deletions: {
      markDeleted: (): Promise<Date | undefined> => {
        calls.push('database:deleted');
        return Promise.resolve(isMarked ? new Date(0) : undefined);
      },
    },
    audit: {
      record: (): Promise<void> => {
        calls.push('audit');
        return Promise.resolve();
      },
    },
    identity: {
      logoutUser: (): Promise<unknown> => {
        calls.push('keycloak:logout');
        return ok(undefined);
      },
    },
    now: (): number => ONE_SECOND * ONE_SECOND,
    onAccountDeleted: (userId: string): void => void calls.push(`sockets:closed:${userId}`),
  };
  return fakes as unknown as DeleteDependencies;
}

const DELETE_INPUT: DeleteInput = {
  authenticatedUser: { userId: MEMBER_USER, keycloakSubject: 'subject-member', roles: ['user'] },
  scope: createOwnerScope(MEMBER_USER),
  authenticationTime: ONE_SECOND,
  clientAddress: '203.0.113.9',
};

describe('blocking an account closes its sockets', () => {
  test('after blocked_at is written and before Keycloak is touched', async () => {
    const calls: Calls = [];
    const block = blockAccount.createBlockAccountUseCase(blockDependencies(calls, false));
    await block({ accountId: MEMBER_ACCOUNT, actor: ACTOR });
    expect(calls).toStrictEqual([
      'database:blocked',
      `sockets:closed:${MEMBER_UUID}`,
      'keycloak:disabled',
      'audit',
    ]);
  });

  test('never when the account does not exist', async () => {
    const calls: Calls = [];
    const block = blockAccount.createBlockAccountUseCase(blockDependencies(calls, true));
    expect(await failureOf(block({ accountId: MEMBER_ACCOUNT, actor: ACTOR }))).toBeInstanceOf(
      Error,
    );
    expect(calls.filter((call) => call.startsWith('sockets:'))).toStrictEqual([]);
  });
});

describe('deleting an account closes its sockets', () => {
  test('right after the deletion mark is written', async () => {
    const calls: Calls = [];
    const remove = deleteAccount.createDeleteAccountUseCase(deleteDependencies(calls, true));
    await remove(DELETE_INPUT);
    expect(calls).toStrictEqual([
      'audit',
      'database:deleted',
      `sockets:closed:${MEMBER_UUID}`,
      'keycloak:logout',
    ]);
  });

  test('never when the mark was not written', async () => {
    const calls: Calls = [];
    const remove = deleteAccount.createDeleteAccountUseCase(deleteDependencies(calls, false));
    expect(await failureOf(remove(DELETE_INPUT))).toBeInstanceOf(Error);
    expect(calls.filter((call) => call.startsWith('sockets:'))).toStrictEqual([]);
  });
});
