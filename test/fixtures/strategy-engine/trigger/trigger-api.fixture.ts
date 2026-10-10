// Copyright (c) 2026 Ada Technology. All rights reserved.
import type * as TriggerModule from '../../../../packages/strategy-engine/src/trigger/index.js';

const PRODUCTION_SOURCE = new URL('../../../../packages/strategy-engine/src', import.meta.url)
  .pathname;

// Os testes dos gatilhos rodam contra a produção; o teste de mutantes os relança num processo à parte apontando esta
// variável para uma cópia mutada do `src`.
export const TRIGGER_MUTANT_VARIABLE = 'TRIGGER_MUTANT_SOURCE';

export type TriggerApi = typeof TriggerModule;

function isTriggerApi(candidate: unknown): candidate is TriggerApi {
  if (typeof candidate !== 'object' || candidate === null) return false;
  return (
    typeof Object.getOwnPropertyDescriptor(candidate, 'computeNextTriggers')?.value === 'function'
  );
}

export function resolveTriggerSource(): string {
  return Bun.env[TRIGGER_MUTANT_VARIABLE] ?? PRODUCTION_SOURCE;
}

export async function loadTriggerApi(): Promise<TriggerApi> {
  const loaded: unknown = await import(`${resolveTriggerSource()}/trigger/index.ts`);
  if (!isTriggerApi(loaded)) throw new Error('Módulo dos gatilhos sem a API esperada.');
  return loaded;
}
