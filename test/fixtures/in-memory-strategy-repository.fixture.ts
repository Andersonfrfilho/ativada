// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope } from '../../packages/database/src/ownership/owner-scope.js';
import type { UserId } from '../../packages/database/src/ownership/user-id.js';

export const OWNER_FILTER_DEFECT = {
  NONE: 'none',
  READ_IGNORES_OWNER: 'read_ignores_owner',
  LIST_IGNORES_OWNER: 'list_ignores_owner',
  RENAME_IGNORES_OWNER: 'rename_ignores_owner',
  STOP_WRITES_BEFORE_CHECK: 'stop_writes_before_check',
  STOP_AFFECTS_EVERY_OWNER: 'stop_affects_every_owner',
} as const;

export type OwnerFilterDefect = (typeof OWNER_FILTER_DEFECT)[keyof typeof OWNER_FILTER_DEFECT];

export type StrategyView = {
  readonly id: string;
  readonly name: string;
  readonly isStopped: boolean;
};

type StoredStrategy = {
  readonly id: string;
  readonly userId: UserId;
  name: string;
  isStopped: boolean;
};

export type RenameStrategyParams = {
  readonly strategyId: string;
  readonly name: string;
};

export type StrategyRepository = {
  readonly create: (scope: OwnerScope, name: string) => Promise<string>;
  readonly findById: (scope: OwnerScope, strategyId: string) => Promise<StrategyView | undefined>;
  readonly list: (scope: OwnerScope) => Promise<readonly StrategyView[]>;
  readonly rename: (scope: OwnerScope, params: RenameStrategyParams) => Promise<boolean>;
  readonly stop: (scope: OwnerScope, strategyId: string) => Promise<boolean>;
};

function toView(stored: StoredStrategy): StrategyView {
  return { id: stored.id, name: stored.name, isStopped: stored.isStopped };
}

export function createInMemoryStrategyRepository(defect: OwnerFilterDefect): StrategyRepository {
  const strategies = new Map<string, StoredStrategy>();

  function findOwned(scope: OwnerScope, strategyId: string): StoredStrategy | undefined {
    const stored = strategies.get(strategyId);
    return stored?.userId === scope.ownerUserId ? stored : undefined;
  }

  function findIgnoringOwner(strategyId: string): StoredStrategy | undefined {
    return strategies.get(strategyId);
  }

  function stopEveryOwner(): void {
    for (const stored of strategies.values()) stored.isStopped = true;
  }

  return {
    create(scope, name): Promise<string> {
      const strategyId = crypto.randomUUID();
      strategies.set(strategyId, {
        id: strategyId,
        userId: scope.ownerUserId,
        name,
        isStopped: false,
      });
      return Promise.resolve(strategyId);
    },
    findById(scope, strategyId): Promise<StrategyView | undefined> {
      const stored =
        defect === OWNER_FILTER_DEFECT.READ_IGNORES_OWNER
          ? findIgnoringOwner(strategyId)
          : findOwned(scope, strategyId);
      return Promise.resolve(stored === undefined ? undefined : toView(stored));
    },
    list(scope): Promise<readonly StrategyView[]> {
      const visible = [...strategies.values()].filter(
        (stored) =>
          defect === OWNER_FILTER_DEFECT.LIST_IGNORES_OWNER || stored.userId === scope.ownerUserId,
      );
      return Promise.resolve(visible.map(toView));
    },
    rename(scope, params): Promise<boolean> {
      const stored =
        defect === OWNER_FILTER_DEFECT.RENAME_IGNORES_OWNER
          ? findIgnoringOwner(params.strategyId)
          : findOwned(scope, params.strategyId);
      if (stored === undefined) return Promise.resolve(false);
      stored.name = params.name;
      return Promise.resolve(true);
    },
    stop(scope, strategyId): Promise<boolean> {
      if (defect === OWNER_FILTER_DEFECT.STOP_WRITES_BEFORE_CHECK) {
        const unchecked = findIgnoringOwner(strategyId);
        if (unchecked !== undefined) unchecked.isStopped = true;
      }
      const stored = findOwned(scope, strategyId);
      if (stored === undefined) return Promise.resolve(false);
      if (defect === OWNER_FILTER_DEFECT.STOP_AFFECTS_EVERY_OWNER) stopEveryOwner();
      stored.isStopped = true;
      return Promise.resolve(true);
    },
  };
}
