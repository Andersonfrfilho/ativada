// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readData, readErrorCode, requestApi } from '../admin-test/api-request.js';
import { ME_PATH } from '../admin-test/admin-test.constant.js';
import { buildAdminUrl, fetchMasterAdminToken } from '../identity-test/keycloak-client.js';
import { sendRequest } from '../identity-test/http-client.js';
import { assertCondition } from '../identity-test/identity-test.error.js';
import { readUserId, readUserRow } from './database-reads.js';
import {
  reportLgpdMeasurement,
  reportLgpdStep,
  type LgpdContext,
  type LgpdOwners,
} from './lgpd-test-context.js';

async function countKeycloakSessions(context: LgpdContext, keycloakId: string): Promise<number> {
  const { environment } = context.identity;
  const token = await fetchMasterAdminToken(environment);
  const result = await sendRequest({
    url: `${buildAdminUrl(environment)}/users/${keycloakId}/sessions`,
    token,
  });
  assertCondition(result.status === 200, `sessões do usuário: ${result.status}`);
  const sessions: unknown = JSON.parse(result.text);
  return Array.isArray(sessions) ? sessions.length : 0;
}

export async function checkDeletionStep1(context: LgpdContext, owners: LgpdOwners): Promise<void> {
  const { baseUrl } = context.api;
  const { ownerA, ownerB } = owners;
  const userIdOfA = await readUserId(context, ownerA.keycloakId);
  const sessionsBefore = await countKeycloakSessions(context, ownerA.keycloakId);
  const answer = await requestApi({
    baseUrl,
    path: ME_PATH,
    method: 'DELETE',
    token: ownerA.accessToken,
  });
  assertCondition(answer.status === 202, `DELETE /v1/me: ${answer.status} ${answer.text}`);
  assertCondition(readData(answer)['status'] === 'deletion_started', 'corpo do 202');
  const row = await readUserRow(context, userIdOfA);
  assertCondition(row?.deleted_at != null, 'deleted_at não gravado');
  assertCondition(
    row.identity_deleted_at === null && row.data_purged_at === null,
    'os passos 2 e 3 não podem rodar dentro da requisição',
  );
  const sessionsAfter = await countKeycloakSessions(context, ownerA.keycloakId);
  reportLgpdMeasurement(
    'sessões de A no Keycloak depois do passo 1 (logout pela service account)',
    `${sessionsBefore} -> ${sessionsAfter}`,
  );
  assertCondition(sessionsAfter === 0, 'a sessão de A deveria ter sido encerrada no Keycloak');
  for (const [description, attempt] of [
    ['GET /v1/me', requestApi({ baseUrl, path: ME_PATH, token: ownerA.accessToken })],
    [
      'DELETE /v1/me (segunda vez)',
      requestApi({ baseUrl, path: ME_PATH, method: 'DELETE', token: ownerA.accessToken }),
    ],
  ] as const) {
    const refused = await attempt;
    assertCondition(
      refused.status === 401 && readErrorCode(refused) === 'ACCOUNT_DELETED',
      `${description} com o token de A: ${refused.status} ${readErrorCode(refused)}`,
    );
  }
  const stillWorks = await requestApi({ baseUrl, path: ME_PATH, token: ownerB.accessToken });
  assertCondition(stillWorks.status === 200, `B depois da exclusão de A: ${stillWorks.status}`);
  reportLgpdStep(
    'DELETE /v1/me',
    '202 deletion_started; deleted_at gravado, passos 2 e 3 pendentes; o token de A recebe 401 ACCOUNT_DELETED em GET /v1/me e em novo DELETE; B segue normal',
  );
}
