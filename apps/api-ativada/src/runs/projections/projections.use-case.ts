// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  OwnerScope,
  ProjectionItemPage,
  ProjectionItemRow,
  ProjectionReadParams,
  RunProjectionRepository,
} from '@ativada/database';

import { encodeTimeCursor } from '../run-cursor.js';
import {
  buildCurrent,
  isLiveRunning,
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
  readonly current: CurrentProjectionView;
  readonly summary: ProjectionSummaryView;
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

// A previsão da próxima vela só existe para a ao vivo rodando; a mais nova linha vem da página (ou de uma leitura de uma linha
// quando o painel pede uma página mais antiga).
async function readCurrent(
  dependencies: ProjectionsDependencies,
  params: {
    readonly scope: OwnerScope;
    readonly context: ProjectionContext;
    readonly page: ProjectionItemPage;
    readonly input: ProjectionsInput;
  },
): Promise<CurrentProjectionView> {
  const { scope, context, input } = params;
  const { run } = context;
  if (!isLiveRunning(run))
    return unavailable(PROJECTION_UNAVAILABLE_REASON.NOT_RUNNING, run.kind === 'live_paper');
  const newest: ProjectionItemRow | undefined =
    input.before === undefined
      ? params.page.items[0]
      : (
          await dependencies.projections.listProjectionItems(scope, run.id, {
            ...toReadParams(context),
            before: undefined,
            limit: 1,
          })
        ).items[0];
  if (newest === undefined) return unavailableWithoutRows(run);
  return buildCurrent({
    live: dependencies.live,
    scope,
    run,
    row: newest,
    durationMilliseconds: context.durationMilliseconds,
  });
}

// As previsões da execução (ADR 0002, spec 009, P3 a P9): nada é recalculado pelo motor. No máximo 6 consultas: execução,
// versão, janelas (só walk-forward), resumo e página (juntos), a linha mais nova (só página mais antiga da ao vivo) e as posições.
export function createProjectionsUseCase(
  dependencies: ProjectionsDependencies,
): ProjectionsUseCase {
  return async (scope, runId, input) => {
    const context = await readProjectionContext(dependencies, { scope, runId });
    const read = toReadParams(context);
    const [counts, page] = await Promise.all([
      dependencies.projections.summarizeProjections(scope, context.run.id, read),
      dependencies.projections.listProjectionItems(scope, context.run.id, {
        ...read,
        before: input.before,
        limit: input.limit,
      }),
    ]);
    return {
      version: PROJECTION_RULE_VERSION,
      timeframe: context.run.timeframe,
      current: await readCurrent(dependencies, { scope, context, page, input }),
      summary: toProjectionSummary(counts),
      items: page.items.map((row) =>
        toProjectionItem({
          row,
          durationMilliseconds: context.durationMilliseconds,
          rangeEnd: read.rangeEnd,
        }),
      ),
      nextCursor: page.nextBefore === undefined ? null : encodeTimeCursor(page.nextBefore),
    };
  };
}
