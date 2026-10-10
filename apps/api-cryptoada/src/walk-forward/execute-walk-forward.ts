// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_STATUS, type RunStatus } from '@cryptoada/database';

import { createSearcher } from './create-searcher.js';
import { finishWalkForward } from './finish-walk-forward.js';
import { prepareWalkForward, type PreparedWalkForward } from './prepare-walk-forward.js';
import { runSearchPhase, type SearchPhaseResult } from './search-phase.js';
import type { SearchInput } from './search-input.js';
import { runTestPhase } from './test-phase.js';
import { WALK_FORWARD_ERROR_CODE, WALK_FORWARD_OUTCOME_STATUS } from './walk-forward.constant.js';
import { WalkForwardRunError } from './walk-forward.error.js';
import type { WalkForwardOptions, WalkForwardOutcome } from './walk-forward.types.js';
import type { WalkForwardRunSession } from './walk-forward-database.types.js';

// Cancelamento não é erro: devolve quantas janelas ficaram gravadas. Qualquer outro estado final é recusa tipada.
async function refuseTerminalRun(params: {
  readonly session: WalkForwardRunSession;
  readonly runId: string;
  readonly status: RunStatus;
}): Promise<WalkForwardOutcome> {
  if (params.status === RUN_STATUS.CANCELLED) {
    return {
      status: WALK_FORWARD_OUTCOME_STATUS.CANCELLED,
      runId: params.runId,
      completedWindows: (await params.session.readWindows()).length,
    };
  }
  throw new WalkForwardRunError(
    WALK_FORWARD_ERROR_CODE.RUN_NOT_RUNNABLE,
    'A execução já foi encerrada.',
  );
}

function vanished(): WalkForwardRunError {
  return new WalkForwardRunError(
    WALK_FORWARD_ERROR_CODE.RUN_NOT_FOUND,
    'A execução deixou de existir.',
  );
}

function buildSearchInput(prepared: PreparedWalkForward): SearchInput {
  const { deps } = prepared;
  return {
    parameters: deps.setup.parameters,
    candles: deps.series.candles,
    sentiments: deps.series.sentiments.map((sentiment) => sentiment ?? null),
    trainSpans: deps.spans.map((window) => window.train),
    strategies: deps.context.combinations.map((combination) => combination.strategy.config),
  };
}

async function search(
  prepared: PreparedWalkForward,
  options: WalkForwardOptions,
): Promise<SearchPhaseResult> {
  const { deps, results } = prepared;
  if (results.size >= deps.context.combinations.length) return { kind: 'finished' };
  const searcher = createSearcher({
    input: buildSearchInput(prepared),
    threads: options.threads,
    engine: options.engine,
  });
  try {
    return await runSearchPhase({
      session: deps.session,
      context: deps.context,
      searcher,
      results,
      progress: deps.progress,
      concurrency: options.threads ?? 1,
      timer: deps.timer,
      report: deps.report,
    });
  } finally {
    await searcher.close();
  }
}

// A busca, o teste janela a janela e o relatório fora da amostra. Cancelamento não é erro.
export async function executeWalkForward(params: {
  readonly session: WalkForwardRunSession;
  readonly runId: string;
  readonly options: WalkForwardOptions;
}): Promise<WalkForwardOutcome> {
  const { session, runId, options } = params;
  const report = (percent: number): void => options.onProgress?.(percent);
  const prepared = await prepareWalkForward({ session, options, report });
  if (prepared.kind === 'refused')
    return refuseTerminalRun({ session, runId, status: prepared.status });
  const searched = await search(prepared, options);
  if (searched.kind === 'stopped')
    return refuseTerminalRun({ session, runId, status: searched.status });
  if (searched.kind === 'vanished') throw vanished();
  const tested = await runTestPhase({
    deps: prepared.deps,
    results: prepared.results,
    stored: prepared.stored,
  });
  if (tested.kind === 'stopped')
    return refuseTerminalRun({ session, runId, status: tested.status });
  if (tested.kind === 'vanished') throw vanished();
  const finished = await finishWalkForward(prepared.deps);
  if (finished.kind === 'completed') return finished.outcome;
  return refuseTerminalRun({ session, runId, status: finished.status });
}
