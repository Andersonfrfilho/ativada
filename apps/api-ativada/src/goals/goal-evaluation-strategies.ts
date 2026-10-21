// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope, StrategyRecord, StrategyRepository } from '@ativada/database';
import {
  createStrategyVersion,
  RULE_KIND,
  StrategyConfigError,
  type StrategyVersion,
} from '@ativada/strategy-engine';

import type { StrategyEntry } from './goal-evaluation-combination.js';
import { GOAL_EVALUATION_MAX_STRATEGIES } from './goal.constant.js';

export type GoalStrategyReader = Pick<
  StrategyRepository,
  'listStrategiesPage' | 'listVersionsPage'
>;

export type LoadedStrategies = {
  readonly entries: readonly StrategyEntry[];
  // Estratégias cuja configuração guardada o motor já não aceita.
  readonly invalid: readonly string[];
  readonly isTruncated: boolean;
};

function toEntry(
  strategy: StrategyRecord,
  newest: { id: string; version: number },
  version: StrategyVersion,
): StrategyEntry {
  return {
    ref: { id: strategy.id, name: strategy.name, versionId: newest.id, version: newest.version },
    strategy: version,
    usesSentiment: version.config.rules.some((rule) => rule.kind === RULE_KIND.FEAR_GREED),
  };
}

export type StrategyLoad =
  { readonly entry: StrategyEntry } | { readonly invalid: string } | undefined;

// A estratégia do dono na versão mais recente; sem versão não há o que avaliar (retorna nada). Configuração que o motor não
// aceita mais vira "inválida".
export async function loadStrategyEntry(
  reader: GoalStrategyReader,
  params: { readonly scope: OwnerScope; readonly strategy: StrategyRecord },
): Promise<StrategyLoad> {
  const { scope, strategy } = params;
  const versions = await reader.listVersionsPage(scope, {
    strategyId: strategy.id,
    limit: 1,
    after: undefined,
  });
  const newest = versions?.versions[0];
  if (newest === undefined) return undefined;
  try {
    return { entry: toEntry(strategy, newest, createStrategyVersion(newest.config)) };
  } catch (error: unknown) {
    if (!(error instanceof StrategyConfigError)) throw error;
    return { invalid: strategy.id };
  }
}

// As estratégias mais novas do dono, cada uma na versão mais recente. Configuração que o motor não aceita mais não derruba
// a avaliação: vira "indisponível" nos pares.
export async function loadGoalStrategies(
  reader: GoalStrategyReader,
  scope: OwnerScope,
): Promise<LoadedStrategies> {
  const page = await reader.listStrategiesPage(scope, {
    limit: GOAL_EVALUATION_MAX_STRATEGIES,
    after: undefined,
  });
  const entries: StrategyEntry[] = [];
  const invalid: string[] = [];
  for (const strategy of page.strategies) {
    const loaded = await loadStrategyEntry(reader, { scope, strategy });
    if (loaded === undefined) continue;
    if ('entry' in loaded) entries.push(loaded.entry);
    else invalid.push(loaded.invalid);
  }
  return { entries, invalid, isTruncated: page.nextCursor !== undefined };
}
