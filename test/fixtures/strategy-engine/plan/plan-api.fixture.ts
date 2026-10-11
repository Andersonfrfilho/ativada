// Copyright (c) 2026 Ada Technology. All rights reserved.
import type * as PlanBoundaryModule from '../../../../packages/strategy-engine/src/plan/plan-boundary.js';
import type * as PlanLevelModule from '../../../../packages/strategy-engine/src/plan/plan-level.js';
import type * as PlanModule from '../../../../packages/strategy-engine/src/plan/index.js';

const PRODUCTION_SOURCE = new URL('../../../../packages/strategy-engine/src', import.meta.url)
  .pathname;

// Os testes do plano rodam contra a produção; o teste de mutantes os relança num processo à parte apontando esta
// variável para uma cópia mutada do `src`.
export const PLAN_MUTANT_VARIABLE = 'PLAN_MUTANT_SOURCE';

export type PlanApi = typeof PlanModule;

const PLAN_API_MEMBERS: readonly string[] = [
  'computeLatestPlan',
  'computeOperationPlan',
  'computePlanLevels',
];

function isPlanApi(candidate: unknown): candidate is PlanApi {
  if (typeof candidate !== 'object' || candidate === null) return false;
  return PLAN_API_MEMBERS.every(
    (member) => typeof Object.getOwnPropertyDescriptor(candidate, member)?.value === 'function',
  );
}

export function resolvePlanSource(): string {
  return Bun.env[PLAN_MUTANT_VARIABLE] ?? PRODUCTION_SOURCE;
}

export async function loadPlanApi(): Promise<PlanApi> {
  const loaded: unknown = await import(`${resolvePlanSource()}/plan/index.ts`);
  if (!isPlanApi(loaded)) throw new Error('Módulo do plano sem a API esperada.');
  return loaded;
}

export type PlanInternals = {
  readonly boundary: typeof PlanBoundaryModule;
  readonly level: typeof PlanLevelModule;
};

// A busca e a montagem do nível, sem passar pelo motor: o contrato delas é testado com preditos fabricados.
export async function loadPlanInternals(): Promise<PlanInternals> {
  const source = resolvePlanSource();
  const boundary: unknown = await import(`${source}/plan/plan-boundary.ts`);
  const level: unknown = await import(`${source}/plan/plan-level.ts`);
  return {
    boundary: boundary as typeof PlanBoundaryModule,
    level: level as typeof PlanLevelModule,
  };
}
