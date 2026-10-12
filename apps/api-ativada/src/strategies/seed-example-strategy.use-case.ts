// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ExampleSeedOutcome, OwnerScope, StrategyRepository } from '@ativada/database';
import { CLASSIC_SCOREBOARD_STRATEGY } from '@ativada/strategy-engine';

import { parseJsonContainer } from '@ativada/run-recording';

export type SeedExampleStrategyDependencies = {
  readonly strategies: Pick<StrategyRepository, 'seedExampleStrategy'>;
};

export type SeedExampleStrategyUseCase = (scope: OwnerScope) => Promise<ExampleSeedOutcome>;

// A cópia do Placar clássico que todo usuário recebe UMA vez (RF03): o repositório decide, pela marca em `users`, se o
// usuário ainda não a recebeu; aqui só se entrega o conteúdo da fonte única do motor.
export function createSeedExampleStrategyUseCase(
  dependencies: SeedExampleStrategyDependencies,
): SeedExampleStrategyUseCase {
  const { name, version } = CLASSIC_SCOREBOARD_STRATEGY;
  const config = parseJsonContainer(JSON.stringify(version.config));
  return (scope) =>
    dependencies.strategies.seedExampleStrategy(scope, {
      name,
      config,
      configHash: version.configHash,
    });
}
