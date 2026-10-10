// Copyright (c) 2026 Ada Technology. All rights reserved.
import { USER_RESOLUTION_STATUS, type OwnerScope } from '@cryptoada/database';

import type { UserResolver } from '../authentication/resolve-authenticated-user.js';

const MAX_TRACKED_USERS = 10_000;

export type ExampleSeedingResolverParams = {
  readonly resolveUser: UserResolver;
  readonly seedExampleStrategy: (scope: OwnerScope) => Promise<unknown>;
  readonly reportFailure: (error: unknown) => void;
};

// Semeia a estratégia de exemplo no primeiro acesso do usuário (e, para quem já existia, no primeiro acesso depois do
// deploy). A falha NUNCA derruba o login: é registrada e a semeadura é tentada de novo no próximo acesso. Acessos
// simultâneos do mesmo usuário compartilham UMA tentativa; depois do sucesso o processo não toca mais o banco por ele.
export function createExampleSeedingUserResolver(
  params: ExampleSeedingResolverParams,
): UserResolver {
  const seeded = new Set<string>();
  const pending = new Map<string, Promise<void>>();

  async function attempt(userId: string, scope: OwnerScope): Promise<void> {
    try {
      await params.seedExampleStrategy(scope);
      if (seeded.size >= MAX_TRACKED_USERS) seeded.clear();
      seeded.add(userId);
    } catch (error: unknown) {
      params.reportFailure(error);
    } finally {
      pending.delete(userId);
    }
  }

  return async (subject) => {
    const resolution = await params.resolveUser(subject);
    if (resolution.status !== USER_RESOLUTION_STATUS.ACTIVE) return resolution;
    if (seeded.has(resolution.userId)) return resolution;
    const inFlight = pending.get(resolution.userId) ?? attempt(resolution.userId, resolution.scope);
    pending.set(resolution.userId, inFlight);
    await inFlight;
    return resolution;
  };
}
