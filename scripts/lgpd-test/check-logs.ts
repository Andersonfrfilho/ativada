// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCondition } from '../identity-test/identity-test.error.js';
import { CHAT_OF_A, CHAT_OF_B, NAME_OF_A, NAME_OF_B } from './lgpd-test.constant.js';
import { reportLgpdStep, type LgpdContext, type LgpdOwners } from './lgpd-test-context.js';

export function checkLogsAreClean(
  context: LgpdContext,
  params: { readonly owners: LgpdOwners; readonly cronOutput: string },
): void {
  const { owners } = params;
  const log = `${context.api.logLines.join('')}${params.cronOutput}`;
  const forbidden = [
    owners.ownerA.email,
    owners.ownerB.email,
    owners.ownerA.keycloakId,
    owners.ownerB.keycloakId,
    owners.ownerA.accessToken,
    owners.ownerB.accessToken,
    NAME_OF_A,
    NAME_OF_B,
    CHAT_OF_A,
    CHAT_OF_B,
    context.api.environment.KEYCLOAK_SERVICE_CLIENT_SECRET,
    '@example.test',
  ];
  for (const value of forbidden) {
    assertCondition(!log.includes(value), 'dado pessoal ou segredo apareceu no log');
  }
  reportLgpdStep(
    'log',
    'nenhum e-mail, nome, chat, id do Keycloak, token nem segredo nos logs da API e do cron',
  );
}
