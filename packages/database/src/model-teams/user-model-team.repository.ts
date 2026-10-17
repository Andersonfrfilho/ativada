// Copyright (c) 2026 Ada Technology. All rights reserved.
import { asc, sql } from 'drizzle-orm';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { userModelTeams } from '../schema/user-model-teams.schema.js';
import type { UserModelTeamRecord, UserModelTeamRepository } from './team-report.types.js';

export function createUserModelTeamRepository(handle: DatabaseHandle): UserModelTeamRepository {
  const { database } = readOpenDatabase(handle);
  return {
    listTeams: async (scope: OwnerScope): Promise<readonly UserModelTeamRecord[]> =>
      database
        .select({ teamKey: userModelTeams.teamKey, isEnabled: userModelTeams.isEnabled })
        .from(userModelTeams)
        .where(ownerCondition(scope, userModelTeams.userId))
        .orderBy(asc(userModelTeams.teamKey)),
    setEnabled: async (scope, params): Promise<void> => {
      await database
        .insert(userModelTeams)
        .values({
          userId: scope.ownerUserId,
          teamKey: params.teamKey,
          isEnabled: params.isEnabled,
        })
        .onConflictDoUpdate({
          target: [userModelTeams.userId, userModelTeams.teamKey],
          set: { isEnabled: params.isEnabled, updatedAt: sql`now()` },
        });
    },
  };
}
