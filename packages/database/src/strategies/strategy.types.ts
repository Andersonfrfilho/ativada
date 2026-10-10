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

export type StrategyRepository = {
  readonly createStrategy: (
    scope: OwnerScope,
    params: CreateStrategyParams,
  ) => Promise<StrategyRecord>;
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
