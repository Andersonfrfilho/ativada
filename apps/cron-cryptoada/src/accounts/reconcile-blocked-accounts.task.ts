// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  AccountId,
  BlockedAccount,
  BlockedAccountRepository,
  BlockedAccountsPage,
} from '@cryptoada/database';
import {
  IDENTITY_OUTCOME,
  mapInBatches,
  type IdentityAdminClient,
} from '@cryptoada/identity-admin';

import { ACCOUNT_PARALLELISM, BLOCKED_ACCOUNTS_BATCH_LIMIT } from '../cron.constant.js';
import type { CronLogger } from '../logging/cron-logger.js';

export type ReconcileBlockedAccountsDependencies = {
  readonly repository: BlockedAccountRepository;
  readonly identity: IdentityAdminClient;
  readonly logger: CronLogger;
};

export type ReconcileSummary = {
  readonly examined: number;
  readonly disabled: number;
  readonly alreadyDisabled: number;
  readonly missing: number;
  readonly skippedUnblocked: number;
  readonly failures: number;
};

export type ReconcileBlockedAccountsTask = () => Promise<ReconcileSummary>;

const RESULT = {
  DISABLED: 'disabled',
  ALREADY_DISABLED: 'alreadyDisabled',
  MISSING: 'missing',
  SKIPPED_UNBLOCKED: 'skippedUnblocked',
  FAILED: 'failed',
} as const;

type AccountResult = (typeof RESULT)[keyof typeof RESULT];

async function disableIfStillBlocked(
  dependencies: ReconcileBlockedAccountsDependencies,
  account: BlockedAccount,
): Promise<AccountResult> {
  const isStillBlocked = await dependencies.repository.isStillBlocked(account.id);
  if (!isStillBlocked) return RESULT.SKIPPED_UNBLOCKED;
  const disabled = await dependencies.identity.setEnabled({
    userId: account.keycloakSubject,
    isEnabled: false,
  });
  if (disabled.status === IDENTITY_OUTCOME.OK) return RESULT.DISABLED;
  return disabled.status === IDENTITY_OUTCOME.NOT_FOUND ? RESULT.MISSING : RESULT.FAILED;
}

async function reconcileAccount(
  dependencies: ReconcileBlockedAccountsDependencies,
  account: BlockedAccount,
): Promise<AccountResult> {
  const current = await dependencies.identity.readEnabled(account.keycloakSubject);
  if (current.status === IDENTITY_OUTCOME.NOT_FOUND) return RESULT.MISSING;
  if (current.status !== IDENTITY_OUTCOME.OK) return RESULT.FAILED;
  if (!current.value) return RESULT.ALREADY_DISABLED;
  return disableIfStillBlocked(dependencies, account);
}

function logResult(
  dependencies: ReconcileBlockedAccountsDependencies,
  params: { readonly accountId: AccountId; readonly result: AccountResult | 'rejected' },
): void {
  const { logger } = dependencies;
  if (params.result === RESULT.DISABLED) {
    logger.info('blocked account disabled in the identity provider', {
      accountId: params.accountId,
    });
  }
  if (params.result === RESULT.FAILED || params.result === 'rejected') {
    logger.error('blocked account not reconciled', {
      accountId: params.accountId,
      result: params.result,
    });
  }
}

async function reconcilePage(
  dependencies: ReconcileBlockedAccountsDependencies,
  page: BlockedAccountsPage,
): Promise<readonly (AccountResult | 'rejected')[]> {
  const settled = await mapInBatches(page.accounts, ACCOUNT_PARALLELISM, (account) =>
    reconcileAccount(dependencies, account),
  );
  return settled.map((outcome, index) => {
    const result = outcome.status === 'fulfilled' ? outcome.value : 'rejected';
    const account = page.accounts[index];
    if (account !== undefined) logResult(dependencies, { accountId: account.id, result });
    return result;
  });
}

function summarize(results: readonly (AccountResult | 'rejected')[]): ReconcileSummary {
  const count = (target: AccountResult): number =>
    results.filter((result) => result === target).length;
  return {
    examined: results.length,
    disabled: count(RESULT.DISABLED),
    alreadyDisabled: count(RESULT.ALREADY_DISABLED),
    missing: count(RESULT.MISSING),
    skippedUnblocked: count(RESULT.SKIPPED_UNBLOCKED),
    failures: results.filter((result) => result === RESULT.FAILED || result === 'rejected').length,
  };
}

export function createReconcileBlockedAccountsTask(
  dependencies: ReconcileBlockedAccountsDependencies,
): ReconcileBlockedAccountsTask {
  return async () => {
    const results: (AccountResult | 'rejected')[] = [];
    let after: AccountId | undefined;
    do {
      const page = await dependencies.repository.listBlockedAccounts({
        limit: BLOCKED_ACCOUNTS_BATCH_LIMIT,
        after,
      });
      results.push(...(await reconcilePage(dependencies, page)));
      after = page.nextCursor;
    } while (after !== undefined);
    return summarize(results);
  };
}
