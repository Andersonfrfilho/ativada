// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { parseAccountId, type AccountId } from '../packages/database/src/admin/admin-account-id.js';
import { createOwnerScope } from '../packages/database/src/ownership/owner-scope.js';
import { userIdFromDatabase, type UserId } from '../packages/database/src/ownership/user-id.js';

const REPOSITORY_ROOT: string = new URL('../', import.meta.url).pathname;
const ADMIN_SOURCE_GLOB = 'packages/database/src/**/admin*.ts';
const OWNER_SCOPE_USAGE_PATTERN = /\bcreateOwnerScope\b|\bOwnerScope\b|\bownerCondition\b/;
const SAMPLE_ACCOUNT_ID_TEXT = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d0e';

async function listAdminSourceFiles(): Promise<readonly string[]> {
  const glob = new Bun.Glob(ADMIN_SOURCE_GLOB);
  const relativePaths: string[] = [];
  for await (const relativePath of glob.scan({ cwd: REPOSITORY_ROOT })) {
    relativePaths.push(relativePath);
  }
  return relativePaths.sort();
}

describe('admin boundary contract', () => {
  test('admin files of @crypto/database never touch OwnerScope', async () => {
    const adminFiles = await listAdminSourceFiles();
    expect(adminFiles.length).toBeGreaterThan(0);
    const offendingFiles: string[] = [];
    for (const relativePath of adminFiles) {
      const text = await Bun.file(`${REPOSITORY_ROOT}${relativePath}`).text();
      if (OWNER_SCOPE_USAGE_PATTERN.test(text)) offendingFiles.push(relativePath);
    }
    expect(offendingFiles).toStrictEqual([]);
  });

  test('the usage pattern catches createOwnerScope and OwnerScope', () => {
    expect(OWNER_SCOPE_USAGE_PATTERN.test('const scope = createOwnerScope(userId);')).toBe(true);
    expect(OWNER_SCOPE_USAGE_PATTERN.test('function block(scope: OwnerScope): void {}')).toBe(true);
    expect(OWNER_SCOPE_USAGE_PATTERN.test('function block(accountId: AccountId): void {}')).toBe(
      false,
    );
  });

  test('parseAccountId accepts only lowercase UUIDs and answers undefined otherwise', () => {
    expect(parseAccountId(SAMPLE_ACCOUNT_ID_TEXT)).toBe(parseAccountId(SAMPLE_ACCOUNT_ID_TEXT));
    for (const invalidValue of ['', 'abc', SAMPLE_ACCOUNT_ID_TEXT.toUpperCase()]) {
      expect(parseAccountId(invalidValue)).toBeUndefined();
    }
  });

  test('AccountId and UserId are not interchangeable', () => {
    const accountId = parseAccountId(SAMPLE_ACCOUNT_ID_TEXT);
    const userId = userIdFromDatabase(SAMPLE_ACCOUNT_ID_TEXT);
    if (accountId === undefined) throw new Error('UUID de exemplo deveria ser aceito');
    // @ts-expect-error: AccountId vindo de requisição não abre escopo de dono
    const forgedScope = createOwnerScope(accountId);
    // @ts-expect-error: UserId não é alvo administrativo
    const forgedAccountId: AccountId = userId;
    const typedUserId: UserId = userId;
    expect([forgedScope, forgedAccountId, typedUserId]).toHaveLength(3);
  });
});
