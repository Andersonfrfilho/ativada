// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_STATUS, type RunStatus, type WalkForwardWindowInput } from '@cryptoada/database';
import { createEngine } from '@cryptoada/strategy-engine';

import type { CandleSeries } from './candle-series.js';
import { loadCandleSeries } from './load-candle-series.js';
import { loadWalkForwardContext, type WalkForwardContext } from './load-walk-forward-context.js';
import { createPhaseTimer, type PhaseTimer } from './phase-timer.js';
import { WALK_FORWARD_ERROR_CODE, WALK_FORWARD_PHASE } from './walk-forward.constant.js';
import { WalkForwardRunError } from './walk-forward.error.js';
import type { WalkForwardOptions } from './walk-forward.types.js';
import { restoreSearchResults, type SearchResults } from './walk-forward-checkpoint.js';
import type { WalkForwardRunSession } from './walk-forward-database.types.js';
import type { WalkForwardDeps } from './walk-forward-deps.js';
import { createProgress } from './walk-forward-progress.js';
import { locateWindows, type WindowSpans } from './window-spans.js';

export type PreparedWalkForward = {
  readonly deps: WalkForwardDeps;
  readonly results: SearchResults;
  readonly stored: readonly WalkForwardWindowInput[];
};

export type PrepareResult =
  | { readonly kind: 'refused'; readonly status: RunStatus }
  | ({ readonly kind: 'ready' } & PreparedWalkForward);

function assertSpans(spans: readonly WindowSpans[], series: CandleSeries): void {
  const isEmpty = spans.some((window) =>
    [window.train, window.test].some(
      (span) => span.anchorIndex < 0 || span.limitIndex <= span.anchorIndex + 1,
    ),
  );
  if (isEmpty || series.candles.length === 0) {
    throw new WalkForwardRunError(
      WALK_FORWARD_ERROR_CODE.NO_CANDLES,
      'Uma janela do plano não tem candle fechado.',
    );
  }
}

async function openRun(params: {
  readonly session: WalkForwardRunSession;
  readonly context: WalkForwardContext;
}): Promise<RunStatus | undefined> {
  if (params.context.run.status !== RUN_STATUS.QUEUED) return undefined;
  const started = await params.session.startRun();
  return started.isStarted ? undefined : started.status;
}

type OpenedContext =
  | { readonly kind: 'refused'; readonly status: RunStatus }
  | { readonly kind: 'opened'; readonly context: WalkForwardContext };

// Lê a execução, valida o pedido e a grade (erro tipado ANTES de qualquer candle) e inicia: `queued → running`
// (transição inválida é recusa tipada).
async function openContext(params: {
  readonly session: WalkForwardRunSession;
  readonly options: WalkForwardOptions;
  readonly timer: PhaseTimer;
}): Promise<OpenedContext> {
  const { session, options } = params;
  const blueprint = await params.timer.measure(WALK_FORWARD_PHASE.LOAD, () => session.findRun());
  if (blueprint === undefined) {
    throw new WalkForwardRunError(
      WALK_FORWARD_ERROR_CODE.RUN_NOT_FOUND,
      'A execução deixou de existir.',
    );
  }
  if (blueprint.run.status === RUN_STATUS.CANCELLED) {
    return { kind: 'refused', status: blueprint.run.status };
  }
  const context = loadWalkForwardContext({
    blueprint,
    request: options,
    now: (options.now ?? Date.now)(),
  });
  const refusal = await openRun({ session, context });
  return refusal === undefined ? { kind: 'opened', context } : { kind: 'refused', status: refusal };
}

function buildDeps(params: {
  readonly session: WalkForwardRunSession;
  readonly options: WalkForwardOptions;
  readonly context: WalkForwardContext;
  readonly series: CandleSeries;
  readonly timer: PhaseTimer;
  readonly report: (percent: number) => void;
}): Omit<WalkForwardDeps, 'progress'> {
  const { context, series } = params;
  const spans = locateWindows(series, context.windows);
  assertSpans(spans, series);
  return {
    session: params.session,
    context,
    setup: context.setup,
    engine: params.options.engine ?? createEngine(),
    series,
    spans,
    timer: params.timer,
    report: params.report,
  };
}

// A carga do período, a conferência de histórico e o que já está gravado: o checkpoint da busca e as janelas
// concluídas.
export async function prepareWalkForward(params: {
  readonly session: WalkForwardRunSession;
  readonly options: WalkForwardOptions;
  readonly report: (percent: number) => void;
}): Promise<PrepareResult> {
  const { session, options } = params;
  const timer = createPhaseTimer();
  const opened = await openContext({ session, options, timer });
  if (opened.kind === 'refused') return opened;
  const { context } = opened;
  const checkpoint =
    context.run.status === RUN_STATUS.RUNNING ? await session.readCheckpoint() : undefined;
  const results = restoreSearchResults({
    checkpoint,
    requestHash: context.requestHash,
    combinations: context.combinations.length,
    windows: context.windows.length,
  });
  const series = await timer.measure(WALK_FORWARD_PHASE.LOAD, () =>
    loadCandleSeries({ session, context }),
  );
  const deps = buildDeps({ session, options, context, series, timer, report: params.report });
  const stored = await session.readWindows();
  const alreadyDone = results.size * context.windows.length + stored.length;
  const progress = createProgress({
    combinations: context.combinations.length,
    windows: context.windows.length,
    alreadyDone,
  });
  return { kind: 'ready', results, stored, deps: { ...deps, progress } };
}
