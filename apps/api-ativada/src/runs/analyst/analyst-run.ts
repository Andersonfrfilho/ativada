// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope, RunRecord } from '@ativada/database';
import { z } from '@ativada/environment';

import { findLiveRun, type LiveStatusRunDependencies } from '../live-status/live-status-context.js';
import { AnalystNotEnabledError } from '../run.error.js';
import { ANALYST_MODE, type AnalystMode } from './analyst.constant.js';

const ANALYST_REQUEST_SCHEMA = z.object({
  analyst: z.object({ mode: z.enum(ANALYST_MODE) }),
});

export type AnalystRun = { readonly run: RunRecord; readonly mode: AnalystMode };

// Execução alheia, inexistente ou apagada é o mesmo 404; outro tipo é 409 `RUN_NOT_LIVE`; ao vivo sem analista (nada em
// `runs.request.analyst`) é 409 `ANALYST_NOT_ENABLED` (A20). A ordem é a das duas rotas.
export async function findAnalystRun(
  dependencies: LiveStatusRunDependencies,
  params: { readonly scope: OwnerScope; readonly runId: string },
): Promise<AnalystRun> {
  const run = await findLiveRun(dependencies, params);
  const parsed = ANALYST_REQUEST_SCHEMA.safeParse(run.request);
  if (!parsed.success) throw new AnalystNotEnabledError();
  return { run, mode: parsed.data.analyst.mode };
}
