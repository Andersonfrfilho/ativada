// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_KIND, type RunKind } from '@ativada/database';
import { z } from '@ativada/environment';

import { RUN_FIELD, RUN_REASON } from './runs.constant.js';

// Os valores espelham `@ativada/risk-analyst` (versão e vela base); um contrato confere que não se afastam.
export const ANALYST_REQUEST_VERSION = 'analyst-1';
export const ANALYST_REQUIRED_TIMEFRAME = '15m';
export const ANALYST_REQUEST_MODE = { SHADOW: 'shadow', GOVERN: 'govern' } as const;
export type AnalystRequestMode = (typeof ANALYST_REQUEST_MODE)[keyof typeof ANALYST_REQUEST_MODE];

export const analystBodySchema = z.strictObject({ mode: z.enum(ANALYST_REQUEST_MODE) });

// O que fica em `runs.request.analyst`.
export type AnalystRequest = {
  readonly version: typeof ANALYST_REQUEST_VERSION;
  readonly mode: AnalystRequestMode;
};

type AnalystBody = {
  readonly kind: RunKind;
  readonly timeframe: string;
  readonly analyst?: z.infer<typeof analystBodySchema> | undefined;
};

function addIssue(context: z.RefinementCtx, path: readonly string[], message: string): void {
  context.addIssue({ code: 'custom', path: [...path], message });
}

function findAnalystIssue(body: AnalystBody): string | undefined {
  if (body.kind !== RUN_KIND.LIVE_PAPER) return RUN_REASON.NOT_ALLOWED_FOR_KIND;
  if (body.timeframe !== ANALYST_REQUIRED_TIMEFRAME) return RUN_REASON.ANALYST_REQUIRES_15M;
  return undefined;
}

// O analista é da simulação ao vivo de 15 min. Governar a simulação só chega na Fase 4 da spec 007: até lá, `govern` é recusado.
export function resolveAnalyst(
  body: AnalystBody,
  context: z.RefinementCtx,
): AnalystRequest | undefined {
  if (body.analyst === undefined) return undefined;
  const { mode } = body.analyst;
  const issue = findAnalystIssue(body);
  if (issue !== undefined) {
    addIssue(context, [RUN_FIELD.ANALYST], issue);
    return undefined;
  }
  if (mode === ANALYST_REQUEST_MODE.GOVERN) {
    addIssue(context, [RUN_FIELD.ANALYST, RUN_FIELD.MODE], RUN_REASON.GOVERN_NOT_AVAILABLE);
    return undefined;
  }
  return { version: ANALYST_REQUEST_VERSION, mode };
}
