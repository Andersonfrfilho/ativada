// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, desc, eq, isNotNull } from 'drizzle-orm';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { readJsonb } from '../jsonb.js';
import type { JsonValue } from '../json-value.types.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { runs } from '../schema/runs.schema.js';
import { RUN_STATUS, type RunKind } from './run.constant.js';

export type FindLatestMetricsParams = {
  readonly strategyVersionId: string;
  readonly kind: RunKind;
};

export type RunMetricsRepository = {
  // As métricas da execução CONCLUÍDA mais recente daquela versão e tipo; `undefined` se nunca houve uma.
  readonly findLatestMetrics: (
    scope: OwnerScope,
    params: FindLatestMetricsParams,
  ) => Promise<JsonValue | undefined>;
};

export function createRunMetricsRepository(handle: DatabaseHandle): RunMetricsRepository {
  const { database } = readOpenDatabase(handle);
  return {
    findLatestMetrics: async (scope, params): Promise<JsonValue | undefined> => {
      const rows = await database
        .select({ metrics: runs.metrics })
        .from(runs)
        .where(
          and(
            ownerCondition(scope, runs.userId),
            eq(runs.strategyVersionId, params.strategyVersionId),
            eq(runs.kind, params.kind),
            eq(runs.status, RUN_STATUS.COMPLETED),
            isNotNull(runs.metrics),
          ),
        )
        .orderBy(desc(runs.finishedAt), desc(runs.id))
        .limit(1);
      const metrics = rows[0]?.metrics;
      return metrics === undefined || metrics === null ? undefined : readJsonb(metrics);
    },
  };
}
