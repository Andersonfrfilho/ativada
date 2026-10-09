// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AccountExportRepository, OwnerScope } from '@crypto/database';
import { IDENTITY_OUTCOME, type IdentityAdminClient } from '@crypto/identity-admin';

import { ProfileNotFoundError } from '../profile/profile.error.js';

export type ExportAccountInput = {
  readonly scope: OwnerScope;
  readonly keycloakSubject: string;
};

export type AccountExportDocument = {
  readonly exportedAt: string;
  readonly account: Readonly<Record<string, unknown>>;
  readonly tables: Readonly<Record<string, readonly unknown[]>>;
  readonly auditEvents: {
    readonly asActor: readonly unknown[];
    readonly asTarget: readonly unknown[];
  };
};

export type ExportAccountUseCase = (input: ExportAccountInput) => Promise<AccountExportDocument>;

export type ExportAccountDependencies = {
  readonly exports: AccountExportRepository;
  readonly identity: IdentityAdminClient;
  readonly now: () => number;
};

// O e-mail mora só no Keycloak; se ele estiver fora do ar a exportação sai com `null` em vez de gastar a cota de 1 por hora.
async function readEmailOrNull(
  identity: IdentityAdminClient,
  keycloakSubject: string,
): Promise<string | null> {
  const outcome = await identity.readEmail(keycloakSubject);
  return outcome.status === IDENTITY_OUTCOME.OK ? (outcome.value ?? null) : null;
}

export function createExportAccountUseCase(
  dependencies: ExportAccountDependencies,
): ExportAccountUseCase {
  return async (input) => {
    const [data, email] = await Promise.all([
      dependencies.exports.exportOwnerData(input.scope),
      readEmailOrNull(dependencies.identity, input.keycloakSubject),
    ]);
    if (data === undefined) throw new ProfileNotFoundError();
    return {
      exportedAt: new Date(dependencies.now()).toISOString(),
      account: { email, ...data.account },
      tables: data.tables,
      auditEvents: data.auditEvents,
    };
  };
}
