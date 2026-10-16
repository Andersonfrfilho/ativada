// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AnalystDecisionRepository, OwnerScope } from '@ativada/database';

import {
  readLiveContext,
  type LiveStatusRunDependencies,
} from '../live-status/live-status-context.js';
import { encodeTimeCursor } from '../run-cursor.js';
import { findAnalystRun } from './analyst-run.js';
import { toAnalystDecisionView } from './analyst-view.js';
import type { AnalystDecisionView } from './analyst.schema.js';

export type AnalystDecisionsDependencies = LiveStatusRunDependencies & {
  readonly analyst: Pick<AnalystDecisionRepository, 'listAnalystDecisionsPage'>;
};

export type AnalystDecisionsInput = {
  // O `candle_time` da última decisão já entregue (exclusivo); ausente = a primeira página.
  readonly before: number | undefined;
  readonly limit: number;
};

export type AnalystDecisionsPage = {
  readonly items: readonly AnalystDecisionView[];
  readonly nextCursor: string | null;
  readonly perPage: number;
};

export type AnalystDecisionsUseCase = (
  scope: OwnerScope,
  runId: string,
  input: AnalystDecisionsInput,
) => Promise<AnalystDecisionsPage>;

// As decisões do analista, da mais nova para a mais antiga, por cursor (spec 007, A20): três consultas, as mesmas linhas
// gravadas pelo worker, com as frases do catálogo fechado.
export function createAnalystDecisionsUseCase(
  dependencies: AnalystDecisionsDependencies,
): AnalystDecisionsUseCase {
  return async (scope, runId, input) => {
    const { run } = await findAnalystRun(dependencies, { scope, runId });
    const [context, page] = await Promise.all([
      readLiveContext(dependencies, { scope, run }),
      dependencies.analyst.listAnalystDecisionsPage(scope, {
        runId: run.id,
        limit: input.limit,
        before: input.before,
      }),
    ]);
    return {
      items: page.decisions.map((record) =>
        toAnalystDecisionView({
          record,
          riskPerTrade: context.config.risk.riskPerTrade,
          durationMilliseconds: context.durationMilliseconds,
        }),
      ),
      nextCursor: page.nextCursor === undefined ? null : encodeTimeCursor(page.nextCursor),
      perPage: input.limit,
    };
  };
}
