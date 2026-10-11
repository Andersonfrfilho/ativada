// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AccountExportRepository, OwnerScope } from '@cryptoada/database';
import { IDENTITY_OUTCOME, type IdentityAdminClient } from '@cryptoada/identity-admin';

import { createAccountExportBody } from './account-export-ndjson.js';
import { ProfileNotFoundError } from '../profile/profile.error.js';
import { IdentityProviderUnavailableError } from '../shared/errors/identity-provider-unavailable.error.js';

export type ExportAccountInput = {
  readonly scope: OwnerScope;
  readonly keycloakSubject: string;
};

// O corpo é o fluxo NDJSON (ver `account-export-ndjson.ts`); `exportedAt` vai ao nome do arquivo.
export type AccountExportStream = {
  readonly exportedAt: string;
  readonly body: ReadableStream<Uint8Array>;
};

export type ExportAccountUseCase = (input: ExportAccountInput) => Promise<AccountExportStream>;

export type ExportAccountDependencies = {
  readonly exports: AccountExportRepository;
  readonly identity: IdentityAdminClient;
  readonly now: () => number;
  // Linhas por página lidas do banco (padrão do repositório); os testes baixam para provar a leitura sob demanda.
  readonly pageSize?: number | undefined;
};

// O e-mail mora só no Keycloak: sem ele a exportação seria incompleta, então falha em 503 (e a cota não é gasta).
async function readEmailOrFail(
  identity: IdentityAdminClient,
  keycloakSubject: string,
): Promise<string | null> {
  const outcome = await identity.readEmail(keycloakSubject);
  if (outcome.status === IDENTITY_OUTCOME.UNAVAILABLE) throw new IdentityProviderUnavailableError();
  return outcome.status === IDENTITY_OUTCOME.OK ? (outcome.value ?? null) : null;
}

export function createExportAccountUseCase(
  dependencies: ExportAccountDependencies,
): ExportAccountUseCase {
  return async (input) => {
    const [account, email] = await Promise.all([
      dependencies.exports.readAccount(input.scope),
      readEmailOrFail(dependencies.identity, input.keycloakSubject),
    ]);
    if (account === undefined) throw new ProfileNotFoundError();
    const exportedAt = new Date(dependencies.now()).toISOString();
    return {
      exportedAt,
      body: createAccountExportBody({
        exportedAt,
        account: { email, ...account },
        chunks: dependencies.exports.streamOwnerRows(input.scope, {
          pageSize: dependencies.pageSize,
        }),
      }),
    };
  };
}
