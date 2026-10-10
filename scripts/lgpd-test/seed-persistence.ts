// Copyright (c) 2026 Ada Technology. All rights reserved.
import { closeDatabase, openDatabase } from '../../packages/database/src/database-handle.js';
import { USER_RESOLUTION_STATUS } from '../../packages/database/src/users/user-resolution.constant.js';
import { resolveUserBySubject } from '../../packages/database/src/users/resolve-user-by-subject.js';
import { seedOwnerPersistence } from '../../packages/database/test-support/persistence-lgpd-checks.js';
import type { Actor } from '../admin-test/admin-test-context.js';
import { reportLgpdStep, type LgpdContext, type LgpdOwners } from './lgpd-test-context.js';

async function seedActor(context: LgpdContext, actor: Actor): Promise<void> {
  const handle = openDatabase(context.databaseUrl);
  try {
    const resolution = await resolveUserBySubject(handle, actor.keycloakId);
    if (resolution.status !== USER_RESOLUTION_STATUS.ACTIVE) throw new Error('usuário não ativo');
    await seedOwnerPersistence(handle, { userId: resolution.userId, scope: resolution.scope });
  } finally {
    await closeDatabase(handle);
  }
}

// Estratégia, execução e resultados dos dois donos, pelos repositórios: a exportação e a purga os alcançam.
export async function seedPersistence(context: LgpdContext, owners: LgpdOwners): Promise<void> {
  await seedActor(context, owners.ownerA);
  await seedActor(context, owners.ownerB);
  reportLgpdStep(
    'estratégias, execuções e resultados de A e de B',
    '12 tabelas por dono: estratégia, versão, execução, sinais, ordens, preenchimentos, posição, patrimônio, comando, janelas do walk-forward, alerta e meta',
  );
}
