// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { WalkForwardRequest } from '../../apps/api-ativada/src/walk-forward/walk-forward.types.js';
import { readPersisted, type PersistedWalkForward } from '../walkforward-test/read-persisted.js';
import {
  createTestRunner,
  newRun,
  type WalkForwardTestContext,
} from '../walkforward-test/walkforward-test-context.js';
import type { ReportPeriod } from './plan-period.js';
import { SEARCH_THREADS } from './report.constant.js';

export type ExecuteRunParams = {
  readonly versionId: string;
  readonly symbol: string;
  readonly timeframe: '1h' | '1d';
  readonly period: ReportPeriod;
  readonly request: WalkForwardRequest;
  readonly costs: { readonly feeRate: string; readonly slippageRate: string };
};

// O corredor de PRODUÇÃO (a thread coordenadora da API) sobre uma execução gravada na base descartável.
export async function executeRun(
  context: WalkForwardTestContext,
  params: ExecuteRunParams,
): Promise<PersistedWalkForward> {
  const run = await newRun(context, {
    versionId: params.versionId,
    symbol: params.symbol,
    timeframe: params.timeframe,
    periodStart: params.period.periodStart,
    periodEnd: params.period.periodEnd,
    request: params.request,
    costs: params.costs,
  });
  const outcome = await createTestRunner(context, { threads: SEARCH_THREADS }).run(run.id);
  const persisted = await readPersisted(context, run.id);
  if (outcome.status !== 'completed' || persisted.status !== 'completed') {
    throw new Error(`Execução ${params.symbol} ${params.timeframe} terminou ${outcome.status}.`);
  }
  return persisted;
}
