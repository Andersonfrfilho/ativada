// Copyright (c) 2026 Ada Technology. All rights reserved.
import type * as GoalModule from '../../../../packages/strategy-engine/src/goal/index.js';

const PRODUCTION_SOURCE = new URL('../../../../packages/strategy-engine/src', import.meta.url)
  .pathname;

// Os testes das metas rodam contra a produção; o teste de mutantes os relança num processo à parte apontando esta
// variável para uma cópia mutada do `src`.
export const GOAL_MUTANT_VARIABLE = 'GOAL_MUTANT_SOURCE';

export type GoalApi = typeof GoalModule;

const GOAL_API_MEMBERS: readonly string[] = [
  'classifyGoalWindow',
  'computeGoalLevels',
  'evaluateGoal',
  'parseGoalSpec',
  'resolveGoalVerdict',
  'summarizeGoalWindows',
];

function isGoalApi(candidate: unknown): candidate is GoalApi {
  if (typeof candidate !== 'object' || candidate === null) return false;
  return GOAL_API_MEMBERS.every(
    (member) => typeof Object.getOwnPropertyDescriptor(candidate, member)?.value === 'function',
  );
}

export function resolveGoalSource(): string {
  return Bun.env[GOAL_MUTANT_VARIABLE] ?? PRODUCTION_SOURCE;
}

export async function loadGoalApi(): Promise<GoalApi> {
  const loaded: unknown = await import(`${resolveGoalSource()}/goal/index.ts`);
  if (!isGoalApi(loaded)) throw new Error('Módulo das metas sem a API esperada.');
  return loaded;
}
