// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope, StrategyRepository } from '@ativada/database';

import {
  loadGoalStrategies,
  loadStrategyEntry,
  type GoalStrategyReader,
  type LoadedStrategies,
} from '../goals/goal-evaluation-strategies.js';
import { StrategyNotFoundError } from '../strategies/strategy.error.js';

export type HorizonStrategyReader = GoalStrategyReader & Pick<StrategyRepository, 'findStrategy'>;

// Sem `strategyId`: as estratégias mais novas do dono, como na avaliação de metas. Com ele: só aquela, e a alheia ou
// inexistente (ou sem versão) é o mesmo 404.
export async function loadHorizonStrategies(
  reader: HorizonStrategyReader,
  params: { readonly scope: OwnerScope; readonly strategyId: string | undefined },
): Promise<LoadedStrategies> {
  const { scope, strategyId } = params;
  if (strategyId === undefined) return loadGoalStrategies(reader, scope);
  const strategy = await reader.findStrategy(scope, strategyId);
  if (strategy === undefined) throw new StrategyNotFoundError();
  const loaded = await loadStrategyEntry(reader, { scope, strategy });
  if (loaded === undefined) throw new StrategyNotFoundError();
  return {
    entries: 'entry' in loaded ? [loaded.entry] : [],
    invalid: 'invalid' in loaded ? [loaded.invalid] : [],
    isTruncated: false,
  };
}
