// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  OwnerScope,
  ProjectionItemPage,
  ProjectionReadParams,
  RunProjectionRepository,
} from '@ativada/database';

import { encodeTimeCursor } from '../run-cursor.js';
import {
  buildCurrent,
  isLiveRunning,
  readHaltReason,
  unavailable,
  unavailableWithoutRows,
  type CurrentProjectionView,
  type CurrentReader,
} from './projection-current.js';
import { toProjectionItem, type ProjectionItemView } from './projection-items.js';
import {
  readProjectionContext,
  type ProjectionContext,
  type ProjectionRunDependencies,
} from './projection-context.js';
import { toProjectionSummary, type ProjectionSummaryView } from './projection-summary.js';
import { PROJECTION_UNAVAILABLE_REASON, PROJECTION_RULE_VERSION } from './projections.constant.js';

export type ProjectionsDependencies = ProjectionRunDependencies & {
  readonly projections: Pick<
    RunProjectionRepository,
    'summarizeProjections' | 'listProjectionItems'
  >;
  readonly live: CurrentReader;
};

export type ProjectionsInput = {
  // O `candle_time` da última previsão já entregue (exclusivo); ausente = a primeira página.
  readonly before: number | undefined;
  readonly limit: number;
};

export type ProjectionsView = {
  readonly version: typeof PROJECTION_RULE_VERSION;
  readonly timeframe: string;
  // `current` e `summary` só vão na primeira página: as páginas por cursor trazem só `items` e `nextCursor` (aditivo).
  readonly current?: CurrentProjectionView;
  readonly summary?: ProjectionSummaryView;
  readonly items: readonly ProjectionItemView[];
  readonly nextCursor: string | null;
};

export type ProjectionsUseCase = (
  scope: OwnerScope,
  runId: string,
  input: ProjectionsInput,
) => Promise<ProjectionsView>;

function toReadParams(context: ProjectionContext): ProjectionReadParams {
  return {
    market: context.market,
    durationMilliseconds: context.durationMilliseconds,
    rangeEnd: context.runRange?.to ?? 0,
    segments: context.segments.map((segment) => ({
      startTime: segment.from,
      endTime: segment.to,
      buy: segment.buy,
      sell: segment.sell,
    })),
  };
}

// A previsão da próxima vela só existe para a ao vivo rodando e em dia; a linha mais nova é a primeira da página.
async function readCurrent(
  dependencies: ProjectionsDependencies,
  params: {
    readonly scope: OwnerScope;
    readonly context: ProjectionContext;
    readonly page: ProjectionItemPage;
  },
): Promise<CurrentProjectionView> {
  const { scope, context } = params;
  const { run } = context;
  if (!isLiveRunning(run))
    return unavailable(PROJECTION_UNAVAILABLE_REASON.NOT_RUNNING, run.kind === 'live_paper');
  const halt = readHaltReason(run);
  if (halt !== undefined) return unavailable(halt, true);
  const newest = params.page.items[0];
  if (newest === undefined) return unavailableWithoutRows(run);
  return buildCurrent({
    live: dependencies.live,
    scope,
    run,
    row: newest,
    durationMilliseconds: context.durationMilliseconds,
  });
}

// As previsões da execução (ADR 0002, spec 009, P3 a P9): nada é recalculado pelo motor. Primeira página: no máximo 5
// consultas (execução, versão, janelas só no walk-forward, resumo e página juntos, posições). Página por cursor: execução,
// versão, janelas e a página — sem resumo nem tendência (M7).
export function createProjectionsUseCase(
  dependencies: ProjectionsDependencies,
): ProjectionsUseCase {
  return async (scope, runId, input) => {
    const context = await readProjectionContext(dependencies, { scope, runId });
    const read = toReadParams(context);
    const isFirstPage = input.before === undefined;
    const [counts, page] = await Promise.all([
      isFirstPage
        ? dependencies.projections.summarizeProjections(scope, context.run.id, read)
        : undefined,
      dependencies.projections.listProjectionItems(scope, context.run.id, {
        ...read,
        before: input.before,
        limit: input.limit,
      }),
    ]);
    const body: Omit<ProjectionsView, 'current' | 'summary'> = {
      version: PROJECTION_RULE_VERSION,
      timeframe: context.run.timeframe,
      items: page.items.map((row) =>
        toProjectionItem({
          row,
          durationMilliseconds: context.durationMilliseconds,
          rangeEnd: read.rangeEnd,
        }),
      ),
      nextCursor: page.nextBefore === undefined ? null : encodeTimeCursor(page.nextBefore),
    };
    if (counts === undefined) return body;
    const current = await readCurrent(dependencies, { scope, context, page });
    return { ...body, current, summary: toProjectionSummary(counts) };
  };
}
