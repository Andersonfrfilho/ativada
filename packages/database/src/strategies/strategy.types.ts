// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonContainer, JsonValue } from '../json-value.types.js';
import type { OwnerScope } from '../ownership/owner-scope.js';
import type { ExampleSeedOutcome } from './strategy.constant.js';

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
  // Teto de versões da estratégia, conferido sob trava: passar dele lança `StorageQuotaReachedError`. A configuração que
  // já existe (mesmo hash) devolve a versão dela mesmo no teto. Ausente = sem teto.
  readonly maxVersions?: number | undefined;
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
  // Teto de estratégias NÃO apagadas do dono, conferido sob trava: passar dele lança `StorageQuotaReachedError`.
  readonly maxStrategies?: number | undefined;
};

export type CreateStrategyWithVersionResult = {
  readonly strategy: StrategyRecord;
  readonly version: StrategyVersionRecord;
};

export type SeedExampleStrategyParams = {
  readonly name: string;
  readonly config: JsonContainer;
  readonly configHash: string;
};

export type EnsureSystemStrategyParams = {
  readonly name: string;
  readonly config: JsonContainer;
  readonly configHash: string;
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
  // UMA vez só por usuário (marca em `users`): a estratégia de exemplo (`is_example`) e a versão 1, na mesma transação.
  // `skipped` quando o usuário já a recebeu (mesmo que a tenha apagado) ou a conta está apagada ou bloqueada.
  readonly seedExampleStrategy: (
    scope: OwnerScope,
    params: SeedExampleStrategyParams,
  ) => Promise<ExampleSeedOutcome>;
  // A estratégia FIXA do sistema (spec 015, `model-team-1`): acha ou cria, numa transação, a estratégia marcada do dono e a versão
  // do hash dado. Fora da lista, do teto de estratégias e das rotas de estratégia; o dono nunca a edita nem apaga.
  readonly ensureSystemStrategyVersion: (
    scope: OwnerScope,
    params: EnsureSystemStrategyParams,
  ) => Promise<StrategyVersionRecord>;
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
