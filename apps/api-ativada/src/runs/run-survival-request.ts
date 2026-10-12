// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_KIND, type RunKind } from '@ativada/database';
import type { z } from '@ativada/environment';
import {
  parseSurvivalSettings,
  SurvivalInputError,
  type SurvivalSettings,
} from '@ativada/strategy-engine';

import { RUN_FIELD, RUN_REASON } from './runs.constant.js';

type SurvivalBody = {
  readonly kind: RunKind;
  readonly survival?:
    | { readonly floorRate?: string | undefined; readonly doubleRate?: string | undefined }
    | undefined;
};

function addIssue(context: z.RefinementCtx, path: readonly string[], message: string): void {
  context.addIssue({ code: 'custom', path: [...path], message });
}

function readSurvivalSettings(
  input: unknown,
  context: z.RefinementCtx,
): SurvivalSettings | undefined {
  try {
    return parseSurvivalSettings(input);
  } catch (error: unknown) {
    if (!(error instanceof SurvivalInputError)) throw error;
    for (const path of error.issues) {
      const field = path.length === 0 ? [RUN_FIELD.SURVIVAL] : [RUN_FIELD.SURVIVAL, path];
      addIssue(context, field, RUN_REASON.INVALID_VALUE);
    }
    return undefined;
  }
}

// O piso/dobro é da simulação ao vivo. Os problemas saem com o caminho do campo e nunca com o valor enviado.
export function resolveSurvival(
  body: SurvivalBody,
  context: z.RefinementCtx,
): SurvivalSettings | undefined {
  if (body.survival === undefined) return undefined;
  if (body.kind !== RUN_KIND.LIVE_PAPER) {
    addIssue(context, [RUN_FIELD.SURVIVAL], RUN_REASON.NOT_ALLOWED_FOR_KIND);
    return undefined;
  }
  return readSurvivalSettings(body.survival, context);
}
