// Copyright (c) 2026 Ada Technology. All rights reserved.
import { asc, sql } from 'drizzle-orm';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { userModelTeams } from '../schema/user-model-teams.schema.js';
import type {
  ClaimOnDemandParams,
  UserModelTeamRecord,
  UserModelTeamRepository,
} from './team-report.types.js';

type Database = ReturnType<typeof readOpenDatabase>['database'];

const TODAY_UTC = sql`(now() AT TIME ZONE 'UTC')::date`;

// O teto é do USUÁRIO no dia (soma das equipes): as linhas dele ficam travadas enquanto se conta, então dois pedidos
// simultâneos nunca passam juntos do teto. Nenhuma linha devolvida pelo UPDATE = teto gasto.
async function claimOnDemand(
  database: Database,
  scope: OwnerScope,
  params: ClaimOnDemandParams,
): Promise<boolean> {
  if (params.dailyLimit <= 0) return false;
  return database.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT 1 FROM user_model_teams WHERE user_id = ${scope.ownerUserId}::uuid FOR UPDATE`,
    );
    const claimed = await transaction.execute(sql`
      UPDATE user_model_teams SET
        on_demand_count = CASE WHEN on_demand_day = ${TODAY_UTC} THEN on_demand_count + 1 ELSE 1 END,
        on_demand_day = ${TODAY_UTC}, updated_at = now()
      WHERE user_id = ${scope.ownerUserId}::uuid AND team_key = ${params.teamKey}
        AND (SELECT COALESCE(SUM(on_demand_count) FILTER (WHERE on_demand_day = ${TODAY_UTC}), 0)
             FROM user_model_teams WHERE user_id = ${scope.ownerUserId}::uuid) < ${params.dailyLimit}
      RETURNING 1`);
    return claimed.length > 0;
  });
}

export function createUserModelTeamRepository(handle: DatabaseHandle): UserModelTeamRepository {
  const { database } = readOpenDatabase(handle);
  return {
    listTeams: async (scope: OwnerScope): Promise<readonly UserModelTeamRecord[]> =>
      database
        .select({ teamKey: userModelTeams.teamKey, isEnabled: userModelTeams.isEnabled })
        .from(userModelTeams)
        .where(ownerCondition(scope, userModelTeams.userId))
        .orderBy(asc(userModelTeams.teamKey)),
    claimOnDemand: (scope, params) => claimOnDemand(database, scope, params),
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
