// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  STORAGE_QUOTA_RESOURCE,
  StorageQuotaReachedError,
} from '../../../packages/database/src/quota/storage-quota.error.js';
import type {
  StrategiesPage,
  StrategyRecord,
  StrategyRepository,
  StrategyVersionRecord,
  VersionsPage,
} from '../../../packages/database/src/index.js';
import { EXAMPLE_SEED_OUTCOME } from '../../../packages/database/src/strategies/strategy.constant.js';
import type { OwnerScope } from '../../../packages/database/src/ownership/owner-scope.js';
import type { UserId } from '../../../packages/database/src/ownership/user-id.js';

type StoredStrategy = { readonly userId: UserId; record: StrategyRecord; deletedAt?: Date };
type StoredVersion = { readonly userId: UserId; readonly record: StrategyVersionRecord };

const EPOCH_MILLISECONDS = 1_700_000_000_000;
const MILLISECONDS_PER_ROW = 1_000;

export type InMemoryStrategies = {
  readonly repository: StrategyRepository;
  readonly calls: { listStrategiesPage: number; listVersionsPage: number };
  readonly versionsOf: (strategyId: string) => readonly StrategyVersionRecord[];
};

// Espelha as regras do repositório real: tudo filtrado pelo dono, recurso alheio some como se não existisse, hash igual
// devolve a MESMA versão.
export function createInMemoryStrategies(): InMemoryStrategies {
  const strategies: StoredStrategy[] = [];
  const versions: StoredVersion[] = [];
  const calls = { listStrategiesPage: 0, listVersionsPage: 0 };
  const seededUsers = new Set<UserId>();
  // A estratégia fixa do sistema fica FORA da lista, do teto e das rotas de estratégia (a coluna `is_system`).
  const systemStrategies = new Map<UserId, string>();
  let sequence = 0;

  function nextDate(): Date {
    sequence += 1;
    return new Date(EPOCH_MILLISECONDS + sequence * MILLISECONDS_PER_ROW);
  }

  function activeOf(scope: OwnerScope, strategyId: string): StoredStrategy | undefined {
    return strategies.find(
      (stored) =>
        stored.userId === scope.ownerUserId &&
        stored.record.id === strategyId &&
        stored.deletedAt === undefined,
    );
  }

  function insertStrategy(scope: OwnerScope, name: string, isExample: boolean): StrategyRecord {
    const createdAt = nextDate();
    const record: StrategyRecord = {
      id: crypto.randomUUID(),
      name,
      isExample,
      createdAt,
      updatedAt: createdAt,
    };
    strategies.push({ userId: scope.ownerUserId, record });
    return record;
  }

  function insertVersion(
    scope: OwnerScope,
    params: { strategyId: string; config: StrategyVersionRecord['config']; configHash: string },
  ): StrategyVersionRecord {
    const existing = versions.filter((stored) => stored.record.strategyId === params.strategyId);
    const record: StrategyVersionRecord = {
      id: crypto.randomUUID(),
      strategyId: params.strategyId,
      version: existing.length + 1,
      config: structuredClone(params.config),
      configHash: params.configHash,
      createdAt: nextDate(),
    };
    versions.push({ userId: scope.ownerUserId, record });
    return record;
  }

  const repository: StrategyRepository = {
    createStrategy: (scope, params) =>
      Promise.resolve(insertStrategy(scope, params.name, params.isExample)),
    createStrategyWithFirstVersion: (scope, params) => {
      const active = strategies.filter(
        (stored) => stored.userId === scope.ownerUserId && stored.deletedAt === undefined,
      ).length;
      if (params.maxStrategies !== undefined && active >= params.maxStrategies) {
        return Promise.reject(new StorageQuotaReachedError(STORAGE_QUOTA_RESOURCE.STRATEGIES));
      }
      const strategy = insertStrategy(scope, params.name, params.isExample);
      const version = insertVersion(scope, { strategyId: strategy.id, ...params });
      return Promise.resolve({ strategy, version });
    },
    ensureSystemStrategyVersion: (scope, params) => {
      const strategyId = systemStrategies.get(scope.ownerUserId) ?? crypto.randomUUID();
      systemStrategies.set(scope.ownerUserId, strategyId);
      const existing = versions.find(
        (stored) =>
          stored.record.strategyId === strategyId && stored.record.configHash === params.configHash,
      );
      return Promise.resolve(existing?.record ?? insertVersion(scope, { strategyId, ...params }));
    },
    seedExampleStrategy: (scope, params) => {
      if (seededUsers.has(scope.ownerUserId)) return Promise.resolve(EXAMPLE_SEED_OUTCOME.SKIPPED);
      seededUsers.add(scope.ownerUserId);
      const strategy = insertStrategy(scope, params.name, true);
      insertVersion(scope, { strategyId: strategy.id, ...params });
      return Promise.resolve(EXAMPLE_SEED_OUTCOME.SEEDED);
    },
    findStrategy: (scope, strategyId) => Promise.resolve(activeOf(scope, strategyId)?.record),
    listStrategies: (scope) =>
      Promise.resolve(
        strategies
          .filter((stored) => stored.userId === scope.ownerUserId && stored.deletedAt === undefined)
          .map((stored) => stored.record),
      ),
    softDeleteStrategy: (scope, strategyId) => {
      const stored = activeOf(scope, strategyId);
      if (stored !== undefined) stored.deletedAt = nextDate();
      return Promise.resolve(stored !== undefined);
    },
    addVersion: (scope, params) => {
      if (activeOf(scope, params.strategyId) === undefined) return Promise.resolve(undefined);
      const same = versions.find(
        (stored) =>
          stored.record.strategyId === params.strategyId &&
          stored.record.configHash === params.configHash,
      );
      if (same !== undefined) return Promise.resolve({ version: same.record, isNew: false });
      const count = versions.filter(
        (stored) => stored.record.strategyId === params.strategyId,
      ).length;
      if (params.maxVersions !== undefined && count >= params.maxVersions) {
        return Promise.reject(
          new StorageQuotaReachedError(STORAGE_QUOTA_RESOURCE.STRATEGY_VERSIONS),
        );
      }
      return Promise.resolve({ version: insertVersion(scope, params), isNew: true });
    },
    findVersion: (scope, versionId) =>
      Promise.resolve(
        versions.find(
          (stored) => stored.userId === scope.ownerUserId && stored.record.id === versionId,
        )?.record,
      ),
    listVersions: (scope, strategyId) =>
      Promise.resolve(
        activeOf(scope, strategyId) === undefined
          ? undefined
          : versions
              .filter((stored) => stored.record.strategyId === strategyId)
              .map((stored) => stored.record),
      ),
    listStrategiesPage: (scope, params): Promise<StrategiesPage> => {
      calls.listStrategiesPage += 1;
      const owned = strategies
        .filter((stored) => stored.userId === scope.ownerUserId && stored.deletedAt === undefined)
        .map((stored) => stored.record)
        .reverse();
      const start =
        params.after === undefined ? 0 : owned.findIndex((row) => row.id === params.after?.id) + 1;
      const page = owned.slice(start, start + params.limit);
      const last = page.at(-1);
      const hasMore = start + params.limit < owned.length;
      return Promise.resolve({
        strategies: page,
        nextCursor:
          hasMore && last !== undefined
            ? { createdAt: last.createdAt.toISOString(), id: last.id }
            : undefined,
      });
    },
    listVersionsPage: (scope, params): Promise<VersionsPage | undefined> => {
      calls.listVersionsPage += 1;
      if (activeOf(scope, params.strategyId) === undefined) return Promise.resolve(undefined);
      const all = versions
        .filter((stored) => stored.record.strategyId === params.strategyId)
        .map((stored) => stored.record)
        .sort((first, second) => second.version - first.version)
        .filter((row) => params.after === undefined || row.version < params.after);
      const page = all.slice(0, params.limit);
      const last = page.at(-1);
      return Promise.resolve({
        versions: page,
        nextCursor: all.length > params.limit && last !== undefined ? last.version : undefined,
      });
    },
  };
  return {
    repository,
    calls,
    versionsOf: (strategyId) =>
      versions.filter((stored) => stored.record.strategyId === strategyId).map((s) => s.record),
  };
}
