// Copyright (c) 2026 Ada Technology. All rights reserved.
import type * as ModelAgentsModule from '../../../packages/model-agents/src/index.js';

const PRODUCTION_SOURCE = new URL('../../../packages/model-agents/src', import.meta.url).pathname;

// Os contratos do pacote rodam contra a produção; o teste de mutantes os relança num processo à parte apontando esta
// variável para uma cópia mutada de `packages/model-agents/src`.
export const MODEL_AGENTS_SOURCE_VARIABLE = 'MODEL_AGENTS_SOURCE';

export type ModelAgentsApi = typeof ModelAgentsModule;

export function resolveModelAgentsSource(): string {
  return Bun.env[MODEL_AGENTS_SOURCE_VARIABLE] ?? PRODUCTION_SOURCE;
}

export async function loadModelAgentsApi(): Promise<ModelAgentsApi> {
  const module: unknown = await import(`${resolveModelAgentsSource()}/index.ts`);
  return module as ModelAgentsApi;
}
