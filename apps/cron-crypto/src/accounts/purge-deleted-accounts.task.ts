// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AccountPurgeRepository, PendingAccount } from '@crypto/database';
import { IDENTITY_OUTCOME, type IdentityAdminClient } from '@crypto/identity-admin';

import {
  AUDIT_IP_RETENTION_MILLISECONDS,
  PENDING_ACCOUNTS_BATCH_LIMIT,
  PURGE_STEP,
} from '../cron.constant.js';
import type { CronLogger } from '../logging/cron-logger.js';

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
  try {
    return await params.run(params.account);
  } catch (error: unknown) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    dependencies.logger.error('purge step failed', { step: params.step, errorName });
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

// Contas independentes entre si; processAccount nunca rejeita, então uma falha não derruba o lote.
export function createPurgeDeletedAccountsTask(
  dependencies: PurgeDeletedAccountsDependencies,
): PurgeDeletedAccountsTask {
  return async () => {
    const accounts = await dependencies.repository.listAccountsPendingPurge({
      limit: PENDING_ACCOUNTS_BATCH_LIMIT,
    });
    const outcomes = await Promise.all(
      accounts.map((account) => processAccount(dependencies, account)),
    );
    const auditIpsExpired = await expireAuditIps(dependencies);
    return { ...summarize(outcomes), auditIpsExpired };
  };
}
