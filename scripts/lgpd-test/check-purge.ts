// Copyright (c) 2026 Ada Technology. All rights reserved.
import { attemptLoginRedirects } from '../admin-test/admin-login.js';
import type { Actor } from '../admin-test/admin-test-context.js';
import { buildAdminUrl, fetchMasterAdminToken } from '../identity-test/keycloak-client.js';
import { sendRequest } from '../identity-test/http-client.js';
import { assertCondition } from '../identity-test/identity-test.error.js';
import {
  countAuditReferences,
  countLinkCodes,
  countNullActorRows,
  readUserId,
  readUserRow,
  snapshotAudit,
} from './database-reads.js';
import { CHAT_OF_B, NAME_OF_B } from './lgpd-test.constant.js';
import {
  reportLgpdStep,
  type AuditSnapshot,
  type LgpdContext,
  type LgpdOwners,
} from './lgpd-test-context.js';
import {
  assertCronSucceeded,
  runCronProcess,
  runPurgeWithoutGracePeriod,
  type CronProcessRun,
} from './run-cron.js';

export type PurgeBaseline = {
  readonly userIdOfA: string;
  readonly userIdOfB: string;
  readonly audit: AuditSnapshot;
};

const HTTP_NOT_FOUND = 404;

async function readKeycloakStatus(context: LgpdContext, keycloakId: string): Promise<number> {
  const { environment } = context.identity;
  const token = await fetchMasterAdminToken(environment);
  const result = await sendRequest({
    url: `${buildAdminUrl(environment)}/users/${keycloakId}`,
    token,
  });
  return result.status;
}

export async function takeBaseline(
  context: LgpdContext,
  owners: LgpdOwners,
): Promise<PurgeBaseline> {
  const userIdOfA = await readUserId(context, owners.ownerA.keycloakId);
  const userIdOfB = await readUserId(context, owners.ownerB.keycloakId);
  return { userIdOfA, userIdOfB, audit: await snapshotAudit(context, { userIdOfA, userIdOfB }) };
}

async function assertOwnerBUntouched(
  context: LgpdContext,
  owners: LgpdOwners,
  baseline: PurgeBaseline,
): Promise<void> {
  const row = await readUserRow(context, baseline.userIdOfB);
  assertCondition(
    row?.display_name === NAME_OF_B && row.telegram_chat_id === CHAT_OF_B,
    'os dados de B foram tocados',
  );
  assertCondition(
    row.deleted_at === null && row.data_purged_at === null,
    'B ganhou estado de exclusão',
  );
  assertCondition((await countLinkCodes(context, baseline.userIdOfB)) === 1, 'código de B');
  assertCondition(
    (await countAuditReferences(context, baseline.userIdOfB)) === baseline.audit.referencingB,
    'a auditoria de B mudou',
  );
  assertCondition(
    (await readKeycloakStatus(context, owners.ownerB.keycloakId)) === 200,
    'B sumiu do Keycloak',
  );
}

export async function checkFirstCronRun(
  context: LgpdContext,
  params: { readonly owners: LgpdOwners; readonly baseline: PurgeBaseline },
): Promise<CronProcessRun> {
  const { owners, baseline } = params;
  const run = await runCronProcess(context);
  assertCronSucceeded(run);
  assertCondition(
    run.summary['identitiesDeleted'] === 1 && run.summary['dataPurged'] === 1,
    `resumo do cron: ${JSON.stringify(run.summary)}`,
  );
  assertCondition(run.summary['rowsRemoved'] === 0, 'a carência de 24 h foi ignorada');
  assertCondition(
    (await readKeycloakStatus(context, owners.ownerA.keycloakId)) === HTTP_NOT_FOUND,
    'A continua no Keycloak',
  );
  const row = await readUserRow(context, baseline.userIdOfA);
  assertCondition(row !== undefined, 'a linha de A saiu antes da carência');
  assertCondition(
    row.identity_deleted_at !== null && row.data_purged_at !== null,
    'as duas colunas de estado deveriam estar preenchidas',
  );
  assertCondition(row.display_name === null && row.telegram_chat_id === null, 'A não anonimizado');
  assertCondition((await countLinkCodes(context, baseline.userIdOfA)) === 0, 'códigos de A restam');
  await assertOwnerBUntouched(context, owners, baseline);
  reportLgpdStep(
    'cron (main.ts, carência de 24 h)',
    'A apagado no Keycloak, dados purgados e pessoais anulados, as duas colunas preenchidas, a linha fica pela carência; B intacto',
  );
  return run;
}

export async function checkAuditPseudonymized(
  context: LgpdContext,
  baseline: PurgeBaseline,
): Promise<void> {
  const after = await snapshotAudit(context, baseline);
  assertCondition(after.total === baseline.audit.total, 'audit_events foi apagada');
  assertCondition(
    (await countAuditReferences(context, baseline.userIdOfA)) === 0,
    'ainda há linha de auditoria apontando para A',
  );
  assertCondition(after.adminRowsOfA === 0, 'o alvo A continua nas linhas do admin');
  assertCondition(
    (await countNullActorRows(context, 'account.deletion_requested')) === 1,
    'a linha da exclusão de A deveria estar sem ator, alvo e IP',
  );
  assertCondition(after.referencingB === baseline.audit.referencingB, 'a auditoria de B mudou');
  reportLgpdStep(
    'audit_events',
    `${after.total} linhas antes e depois; nenhuma aponta para A; a da exclusão de A ficou sem ator, alvo e IP; as de B intactas`,
  );
}

export async function checkLoginRefused(context: LgpdContext, ownerA: Actor): Promise<void> {
  const redirects = await attemptLoginRedirects({
    identity: context.identity,
    baseUrl: context.api.baseUrl,
    redirectUri: context.api.environment.SESSION_ALLOWED_REDIRECT_URIS[0] ?? '',
    user: { id: ownerA.keycloakId, username: ownerA.username, email: ownerA.email },
  });
  assertCondition(!redirects, 'o Keycloak ainda deixa A entrar');
  reportLgpdStep('login de A', 'recusado: o usuário não existe mais no Keycloak');
}

export async function checkRerunAndRemoval(
  context: LgpdContext,
  params: { readonly owners: LgpdOwners; readonly baseline: PurgeBaseline },
): Promise<void> {
  const { owners, baseline } = params;
  const again = await runCronProcess(context);
  assertCronSucceeded(again);
  assertCondition(
    again.summary['identitiesDeleted'] === 0 &&
      again.summary['dataPurged'] === 0 &&
      again.summary['rowsRemoved'] === 0,
    `segunda execução deveria ser vazia: ${JSON.stringify(again.summary)}`,
  );
  reportLgpdStep('cron de novo', 'idempotente: nada a refazer, saída 0');
  const summary = await runPurgeWithoutGracePeriod(context);
  assertCondition(
    summary.rowsRemoved === 1 && summary.failures === 0,
    `remoção: ${JSON.stringify(summary)}`,
  );
  assertCondition(
    (await readUserRow(context, baseline.userIdOfA)) === undefined,
    'a linha de A deveria ter saído',
  );
  assertCondition(
    (await snapshotAudit(context, baseline)).total === baseline.audit.total,
    'a remoção da linha apagou a auditoria',
  );
  assertCondition(
    (await countNullActorRows(context, 'account.deletion_requested')) === 1,
    'a auditoria da exclusão de A sumiu',
  );
  await assertOwnerBUntouched(context, owners, baseline);
  reportLgpdStep(
    'remoção da linha (carência forçada pelo parâmetro do teste)',
    'a linha de A saiu só com as duas colunas e passada a carência; audit_events e B intactos',
  );
}
