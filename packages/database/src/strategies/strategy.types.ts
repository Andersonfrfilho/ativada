// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonContainer, JsonValue } from '../json-value.types.js';
import type { OwnerScope } from '../ownership/owner-scope.js';

export type StrategyRecord = {
  readonly id: string;
  readonly name: string;
  readonly isExample: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type StrategyVersionRecord = {
  readonly id: string;
  readonly strategyId: string;
  readonly version: number;
  readonly config: JsonValue;
  readonly configHash: string;
  readonly createdAt: Date;
};

export type CreateStrategyParams = {
  readonly name: string;
  readonly isExample: boolean;
};

// `configHash` é o SHA-256 canônico da configuração, calculado por quem chama (o pacote não importa o motor).
export type AddStrategyVersionParams = {
  readonly strategyId: string;
  readonly config: JsonContainer;
  readonly configHash: string;
};

export type AddStrategyVersionResult = {
  readonly version: StrategyVersionRecord;
  readonly isNew: boolean;
};

// `createdAt` é o texto do Postgres com microssegundos: o Date do JS só guarda milissegundos.
export type StrategyCursor = {
  readonly createdAt: string;
  readonly id: string;
};

export type ListStrategiesParams = {
  readonly limit: number;
  readonly after: StrategyCursor | undefined;
};

export type StrategiesPage = {
  readonly strategies: readonly StrategyRecord[];
  readonly nextCursor: StrategyCursor | undefined;
};

// Versões da mais nova para a mais antiga; o cursor é o número da última versão da página.
export type ListVersionsParams = {
  readonly strategyId: string;
  readonly limit: number;
  readonly after: number | undefined;
};

export type VersionsPage = {
  readonly versions: readonly StrategyVersionRecord[];
  readonly nextCursor: number | undefined;
};

export type CreateStrategyWithVersionParams = CreateStrategyParams & {
  readonly config: JsonContainer;
  readonly configHash: string;
};

export type CreateStrategyWithVersionResult = {
  readonly strategy: StrategyRecord;
  readonly version: StrategyVersionRecord;
};

export type StrategyRepository = {
  readonly createStrategy: (
    scope: OwnerScope,
    params: CreateStrategyParams,
  ) => Promise<StrategyRecord>;
  // A estratégia e a versão 1 nascem na mesma transação: nunca fica estratégia sem versão.
  readonly createStrategyWithFirstVersion: (
    scope: OwnerScope,
    params: CreateStrategyWithVersionParams,
  ) => Promise<CreateStrategyWithVersionResult>;
  readonly listStrategiesPage: (
    scope: OwnerScope,
    params: ListStrategiesParams,
  ) => Promise<StrategiesPage>;
  readonly listVersionsPage: (
    scope: OwnerScope,
    params: ListVersionsParams,
  ) => Promise<VersionsPage | undefined>;
  readonly findStrategy: (
    scope: OwnerScope,
    strategyId: string,
  ) => Promise<StrategyRecord | undefined>;
  readonly listStrategies: (scope: OwnerScope) => Promise<readonly StrategyRecord[]>;
  readonly softDeleteStrategy: (scope: OwnerScope, strategyId: string) => Promise<boolean>;
  readonly addVersion: (
    scope: OwnerScope,
    params: AddStrategyVersionParams,
  ) => Promise<AddStrategyVersionResult | undefined>;
  readonly findVersion: (
    scope: OwnerScope,
    versionId: string,
  ) => Promise<StrategyVersionRecord | undefined>;
  readonly listVersions: (
    scope: OwnerScope,
    strategyId: string,
  ) => Promise<readonly StrategyVersionRecord[] | undefined>;
};
