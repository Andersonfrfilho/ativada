// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  AccountPurgeRepository,
  PendingAccount,
  PendingAccountCursor,
} from '@crypto/database';
import { IDENTITY_OUTCOME, mapInBatches, type IdentityAdminClient } from '@crypto/identity-admin';

import {
  ACCOUNT_PARALLELISM,
  AUDIT_IP_RETENTION_MILLISECONDS,
  PENDING_ACCOUNTS_BATCH_LIMIT,
  PURGE_STEP,
} from '../cron.constant.js';
import type { CronLogger } from '../logging/cron-logger.js';
import { IdentityRealmUnavailableError } from './identity-realm-unavailable.error.js';

export type PurgeDeletedAccountsDependencies = {
  readonly repository: AccountPurgeRepository;
  readonly identity: IdentityAdminClient;
  readonly logger: CronLogger;
  readonly now: () => number;
  readonly gracePeriodMilliseconds: number;
};

export type PurgeSummary = {
  readonly examined: number;
  readonly identitiesDeleted: number;
  readonly dataPurged: number;
  readonly rowsRemoved: number;
  readonly auditIpsExpired: number;
  readonly failures: number;
};

export type PurgeDeletedAccountsTask = () => Promise<PurgeSummary>;

type StepRun = (account: PendingAccount) => Promise<boolean>;

type AccountOutcome = {
  readonly wasIdentityDeleted: boolean;
  readonly wasDataPurged: boolean;
  readonly wasRowRemoved: boolean;
  readonly failures: number;
};

// Passo 2: 404 no Keycloak é "já apagado"; só indisponibilidade ou conflito deixam a coluna vazia.
function createDeleteIdentityStep(dependencies: PurgeDeletedAccountsDependencies): StepRun {
  return async (account) => {
    const outcome = await dependencies.identity.deleteUser(account.keycloakSubject);
    const isGone =
      outcome.status === IDENTITY_OUTCOME.OK || outcome.status === IDENTITY_OUTCOME.NOT_FOUND;
    if (!isGone) return false;
    await dependencies.repository.markIdentityDeleted(account.scope);
    return true;
  };
}

function createPurgeDataStep(dependencies: PurgeDeletedAccountsDependencies): StepRun {
  return async (account) => {
    await dependencies.repository.purgeAccountData(account.scope);
    return true;
  };
}

function createRemoveRowStep(dependencies: PurgeDeletedAccountsDependencies): StepRun {
  return async (account) => {
    const deletedBefore = new Date(dependencies.now() - dependencies.gracePeriodMilliseconds);
    return dependencies.repository.removeUserRow(account.scope, { deletedBefore });
  };
}

async function runStep(
  dependencies: PurgeDeletedAccountsDependencies,
  params: { readonly step: string; readonly run: StepRun; readonly account: PendingAccount },
): Promise<boolean> {
  const accountId = params.account.scope.ownerUserId;
  try {
    const isDone = await params.run(params.account);
    if (!isDone)
      dependencies.logger.error('purge step incomplete', { step: params.step, accountId });
    return isDone;
  } catch (error: unknown) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    dependencies.logger.error('purge step failed', { step: params.step, errorName, accountId });
    return false;
  }
}

function isGracePeriodOver(
  dependencies: PurgeDeletedAccountsDependencies,
  account: PendingAccount,
): boolean {
  return account.deletedAt.getTime() + dependencies.gracePeriodMilliseconds <= dependencies.now();
}

async function processAccount(
  dependencies: PurgeDeletedAccountsDependencies,
  account: PendingAccount,
): Promise<AccountOutcome> {
  const identityStep = {
    step: PURGE_STEP.IDENTITY_DELETION,
    run: createDeleteIdentityStep(dependencies),
  };
  const dataStep = { step: PURGE_STEP.DATA_PURGE, run: createPurgeDataStep(dependencies) };
  const removalStep = { step: PURGE_STEP.ROW_REMOVAL, run: createRemoveRowStep(dependencies) };
  const wasIdentityDeleted =
    account.identityDeletedAt === undefined &&
    (await runStep(dependencies, { ...identityStep, account }));
  const wasDataPurged =
    account.dataPurgedAt === undefined && (await runStep(dependencies, { ...dataStep, account }));
  const isIdentityDone = account.identityDeletedAt !== undefined || wasIdentityDeleted;
  const isDataDone = account.dataPurgedAt !== undefined || wasDataPurged;
  const isReadyForRemoval =
    isIdentityDone && isDataDone && isGracePeriodOver(dependencies, account);
  const wasRowRemoved =
    isReadyForRemoval && (await runStep(dependencies, { ...removalStep, account }));
  const pendingSteps = [!isIdentityDone, !isDataDone, isReadyForRemoval && !wasRowRemoved];
  return {
    wasIdentityDeleted,
    wasDataPurged,
    wasRowRemoved,
    failures: pendingSteps.filter(Boolean).length,
  };
}

async function expireAuditIps(dependencies: PurgeDeletedAccountsDependencies): Promise<number> {
  const olderThan = new Date(dependencies.now() - AUDIT_IP_RETENTION_MILLISECONDS);
  return dependencies.repository.expireAuditIps(olderThan);
}

function summarize(outcomes: readonly AccountOutcome[]): PurgeSummary {
  return {
    examined: outcomes.length,
    identitiesDeleted: outcomes.filter((outcome) => outcome.wasIdentityDeleted).length,
    dataPurged: outcomes.filter((outcome) => outcome.wasDataPurged).length,
    rowsRemoved: outcomes.filter((outcome) => outcome.wasRowRemoved).length,
    auditIpsExpired: 0,
    failures: outcomes.reduce((total, outcome) => total + outcome.failures, 0),
  };
}

const FAILED_ACCOUNT_OUTCOME: AccountOutcome = {
  wasIdentityDeleted: false,
  wasDataPurged: false,
  wasRowRemoved: false,
  failures: 1,
};

async function processAllPages(
  dependencies: PurgeDeletedAccountsDependencies,
): Promise<readonly AccountOutcome[]> {
  const removableBefore = new Date(dependencies.now() - dependencies.gracePeriodMilliseconds);
  const outcomes: AccountOutcome[] = [];
  let after: PendingAccountCursor | undefined;
  do {
    const page = await dependencies.repository.listAccountsPendingPurge({
      limit: PENDING_ACCOUNTS_BATCH_LIMIT,
      removableBefore,
      after,
    });
    const settled = await mapInBatches(page.accounts, ACCOUNT_PARALLELISM, (account) =>
      processAccount(dependencies, account),
    );
    outcomes.push(
      ...settled.map((result) =>
        result.status === 'fulfilled' ? result.value : FAILED_ACCOUNT_OUTCOME,
      ),
    );
    after = page.nextCursor;
  } while (after !== undefined);
  return outcomes;
}

async function assertRealmExists(dependencies: PurgeDeletedAccountsDependencies): Promise<void> {
  const realm = await dependencies.identity.verifyRealm();
  if (realm.status === IDENTITY_OUTCOME.NOT_FOUND) throw new IdentityRealmUnavailableError();
}

// Contas independentes: a página é lida por cursor, em lotes, e a falha de uma não derruba as outras.
export function createPurgeDeletedAccountsTask(
  dependencies: PurgeDeletedAccountsDependencies,
): PurgeDeletedAccountsTask {
  return async () => {
    await assertRealmExists(dependencies);
    const outcomes = await processAllPages(dependencies);
    const auditIpsExpired = await expireAuditIps(dependencies);
    return { ...summarize(outcomes), auditIpsExpired };
  };
}
