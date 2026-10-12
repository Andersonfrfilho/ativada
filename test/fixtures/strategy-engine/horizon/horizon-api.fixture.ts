// Copyright (c) 2026 Ada Technology. All rights reserved.
import type * as HorizonModule from '../../../../packages/strategy-engine/src/horizon/index.js';

const PRODUCTION_SOURCE = new URL('../../../../packages/strategy-engine/src', import.meta.url)
  .pathname;

// Os testes dos prazos rodam contra a produção; o teste de mutantes os relança num processo à parte apontando esta
// variável para uma cópia mutada do `src`.
export const HORIZON_MUTANT_VARIABLE = 'HORIZON_MUTANT_SOURCE';

export type HorizonApi = typeof HorizonModule;

const HORIZON_API_MEMBERS: readonly string[] = ['computeHorizonWindows', 'summarizeHorizon'];

function isHorizonApi(candidate: unknown): candidate is HorizonApi {
  if (typeof candidate !== 'object' || candidate === null) return false;
  return HORIZON_API_MEMBERS.every(
    (member) => typeof Object.getOwnPropertyDescriptor(candidate, member)?.value === 'function',
  );
}

export function resolveHorizonSource(): string {
  return Bun.env[HORIZON_MUTANT_VARIABLE] ?? PRODUCTION_SOURCE;
}

export async function loadHorizonApi(): Promise<HorizonApi> {
  const loaded: unknown = await import(`${resolveHorizonSource()}/horizon/index.ts`);
  if (!isHorizonApi(loaded)) throw new Error('Módulo dos prazos sem a API esperada.');
  return loaded;
}
