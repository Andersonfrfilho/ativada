// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope, RunLiveStatusRepository } from '@ativada/database';

import { toDecisionsPageView, toPositionsParams } from './decision-page.js';
import {
  findSignalRun,
  readLiveContext,
  toDecisionMarket,
  type LiveStatusRunDependencies,
} from './live-status-context.js';
import type { DecisionView } from './live-status-view.js';

export type RunDecisionsDependencies = LiveStatusRunDependencies & {
  readonly live: Pick<RunLiveStatusRepository, 'listDecisionRows' | 'listPositionsAround'>;
};

export type RunDecisionsInput = {
  // O `candle_time` da última decisão já entregue (exclusivo); ausente = a primeira página.
  readonly before: number | undefined;
  // O `candle_time` da vela pedida (inclusive): a página começa nela e segue para as anteriores.
  readonly at?: number | undefined;
  readonly limit: number;
};

export type RunDecisionsPage = {
  readonly items: readonly DecisionView[];
  readonly nextCursor: string | null;
  readonly perPage: number;
};

export type RunDecisionsUseCase = (
  scope: OwnerScope,
  runId: string,
  input: RunDecisionsInput,
) => Promise<RunDecisionsPage>;

// As decisões seguintes do acompanhamento (spec 008, RF14): quatro consultas, as mesmas linhas do `live-status`.
export function createRunDecisionsUseCase(
  dependencies: RunDecisionsDependencies,
): RunDecisionsUseCase {
  return async (scope, runId, input) => {
    const run = await findSignalRun(dependencies, { scope, runId });
    const [context, page] = await Promise.all([
      readLiveContext(dependencies, { scope, run }),
      dependencies.live.listDecisionRows(scope, run.id, {
        market: toDecisionMarket(dependencies, run),
        before: input.at === undefined ? input.before : input.at + 1,
        limit: input.limit,
      }),
    ]);
    const positions = await dependencies.live.listPositionsAround(
      scope,
      run.id,
      toPositionsParams({ rows: page.items, durationMilliseconds: context.durationMilliseconds }),
    );
    return { ...toDecisionsPageView({ context, page, positions }), perPage: input.limit };
  };
}
