// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope, StrategyCursor, StrategyRepository } from '@cryptoada/database';
import type { StrategyVersion } from '@cryptoada/strategy-engine';

import { parseJsonContainer } from '@cryptoada/run-recording';
import { encodeStrategyCursor, encodeVersionCursor } from './strategy-cursor.js';
import { StrategyNotFoundError } from './strategy.error.js';
import {
  toStrategyVersionView,
  toStrategyView,
  type StrategyVersionView,
  type StrategyView,
} from './strategy-views.js';

export type StrategyUseCaseDependencies = {
  readonly strategies: Pick<
    StrategyRepository,
    | 'createStrategyWithFirstVersion'
    | 'listStrategiesPage'
    | 'listVersionsPage'
    | 'addVersion'
    | 'findStrategy'
  >;
};

export type PageInput<TCursor> = { readonly limit: number; readonly after: TCursor | undefined };

export type PageOutput<TItem> = {
  readonly items: readonly TItem[];
  readonly nextCursor: string | null;
  readonly perPage: number;
};

export type CreatedStrategy = {
  readonly strategy: StrategyView;
  readonly version: StrategyVersionView;
};

export type StrategyDetail = StrategyView & { readonly latestVersion: StrategyVersionView | null };

export type AddedVersion = { readonly version: StrategyVersionView; readonly isNew: boolean };

export type CreateStrategyUseCase = (
  scope: OwnerScope,
  input: { readonly name: string; readonly version: StrategyVersion },
) => Promise<CreatedStrategy>;

export type ListStrategiesUseCase = (
  scope: OwnerScope,
  input: PageInput<StrategyCursor>,
) => Promise<PageOutput<StrategyView>>;

export type GetStrategyUseCase = (scope: OwnerScope, strategyId: string) => Promise<StrategyDetail>;

export type ListVersionsUseCase = (
  scope: OwnerScope,
  input: PageInput<number> & { readonly strategyId: string },
) => Promise<PageOutput<StrategyVersionView>>;

export type AddVersionUseCase = (
  scope: OwnerScope,
  input: { readonly strategyId: string; readonly version: StrategyVersion },
) => Promise<AddedVersion>;

function toConfigJson(version: StrategyVersion): ReturnType<typeof parseJsonContainer> {
  return parseJsonContainer(JSON.stringify(version.config));
}

export function createCreateStrategyUseCase(
  dependencies: StrategyUseCaseDependencies,
): CreateStrategyUseCase {
  return async (scope, input) => {
    const created = await dependencies.strategies.createStrategyWithFirstVersion(scope, {
      name: input.name,
      isExample: false,
      config: toConfigJson(input.version),
      configHash: input.version.configHash,
    });
    return {
      strategy: toStrategyView(created.strategy),
      version: toStrategyVersionView(created.version),
    };
  };
}

export function createListStrategiesUseCase(
  dependencies: StrategyUseCaseDependencies,
): ListStrategiesUseCase {
  return async (scope, input) => {
    const page = await dependencies.strategies.listStrategiesPage(scope, input);
    return {
      items: page.strategies.map(toStrategyView),
      nextCursor: page.nextCursor === undefined ? null : encodeStrategyCursor(page.nextCursor),
      perPage: input.limit,
    };
  };
}

export function createGetStrategyUseCase(
  dependencies: StrategyUseCaseDependencies,
): GetStrategyUseCase {
  return async (scope, strategyId) => {
    const strategy = await dependencies.strategies.findStrategy(scope, strategyId);
    if (strategy === undefined) throw new StrategyNotFoundError();
    const newest = await dependencies.strategies.listVersionsPage(scope, {
      strategyId,
      limit: 1,
      after: undefined,
    });
    const latest = newest?.versions[0];
    return {
      ...toStrategyView(strategy),
      latestVersion: latest === undefined ? null : toStrategyVersionView(latest),
    };
  };
}

export function createListVersionsUseCase(
  dependencies: StrategyUseCaseDependencies,
): ListVersionsUseCase {
  return async (scope, input) => {
    const page = await dependencies.strategies.listVersionsPage(scope, input);
    if (page === undefined) throw new StrategyNotFoundError();
    return {
      items: page.versions.map(toStrategyVersionView),
      nextCursor: page.nextCursor === undefined ? null : encodeVersionCursor(page.nextCursor),
      perPage: input.limit,
    };
  };
}

// Configuração igual (mesmo hash) devolve a MESMA versão, sem criar outra (RF03).
export function createAddVersionUseCase(
  dependencies: StrategyUseCaseDependencies,
): AddVersionUseCase {
  return async (scope, input) => {
    const added = await dependencies.strategies.addVersion(scope, {
      strategyId: input.strategyId,
      config: toConfigJson(input.version),
      configHash: input.version.configHash,
    });
    if (added === undefined) throw new StrategyNotFoundError();
    return { version: toStrategyVersionView(added.version), isNew: added.isNew };
  };
}
