// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { computeBalanceSurvival } from '../../../../packages/strategy-engine/src/survival/compute-balance-survival.js';
import type { parseSurvivalSettings } from '../../../../packages/strategy-engine/src/survival/survival-settings.schema.js';

const PRODUCTION_SOURCE = new URL('../../../../packages/strategy-engine/src', import.meta.url)
  .pathname;

// Os testes de sobrevivência rodam contra a produção; o teste de mutantes os relança num processo à parte apontando
// esta variável para uma cópia mutada do `src`.
export const SURVIVAL_MUTANT_VARIABLE = 'SURVIVAL_MUTANT_SOURCE';

export type SurvivalApi = {
  readonly computeBalanceSurvival: typeof computeBalanceSurvival;
  readonly parseSurvivalSettings: typeof parseSurvivalSettings;
};

function readMember(module: unknown, name: string): unknown {
  if (typeof module !== 'object' || module === null) return undefined;
  return Object.getOwnPropertyDescriptor(module, name)?.value;
}

export function resolveSurvivalSource(): string {
  return Bun.env[SURVIVAL_MUTANT_VARIABLE] ?? PRODUCTION_SOURCE;
}

export async function loadSurvivalApi(): Promise<SurvivalApi> {
  const root = resolveSurvivalSource();
  const compute: unknown = await import(`${root}/survival/compute-balance-survival.ts`);
  const settings: unknown = await import(`${root}/survival/survival-settings.schema.ts`);
  const computeMember = readMember(compute, 'computeBalanceSurvival');
  const settingsMember = readMember(settings, 'parseSurvivalSettings');
  if (typeof computeMember !== 'function' || typeof settingsMember !== 'function') {
    throw new Error('Módulo de sobrevivência sem a API esperada.');
  }
  return {
    computeBalanceSurvival: computeMember as SurvivalApi['computeBalanceSurvival'],
    parseSurvivalSettings: settingsMember as SurvivalApi['parseSurvivalSettings'],
  };
}
