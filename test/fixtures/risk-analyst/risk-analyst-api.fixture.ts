// Copyright (c) 2026 Ada Technology. All rights reserved.
import type * as RiskAnalystModule from '../../../packages/risk-analyst/src/index.js';

const PRODUCTION_SOURCE = new URL('../../../packages/risk-analyst/src', import.meta.url).pathname;

// Os contratos do analista rodam contra a produção; o teste de mutantes os relança num processo à parte apontando esta
// variável para uma cópia mutada de `packages/risk-analyst/src`.
export const RISK_ANALYST_SOURCE_VARIABLE = 'RISK_ANALYST_SOURCE';

export type RiskAnalystApi = typeof RiskAnalystModule;

export function resolveRiskAnalystSource(): string {
  return Bun.env[RISK_ANALYST_SOURCE_VARIABLE] ?? PRODUCTION_SOURCE;
}

export async function loadRiskAnalystApi(): Promise<RiskAnalystApi> {
  const module: unknown = await import(`${resolveRiskAnalystSource()}/index.ts`);
  return module as RiskAnalystApi;
}
