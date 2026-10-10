// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RunStatus } from '@cryptoada/database';

import { commitUnit } from './commit-unit.js';
import { WALK_FORWARD_PHASE } from './walk-forward.constant.js';
import type { WalkForwardContext } from './load-walk-forward-context.js';
import type { PhaseTimer } from './phase-timer.js';
import { serializeSearchResults, type SearchResults } from './walk-forward-checkpoint.js';
import type { WalkForwardRunSession } from './walk-forward-database.types.js';
import type { WalkForwardProgress } from './walk-forward-progress.js';
import type { CombinationSearcher } from './search-input.js';

export type SearchPhaseParams = {
  readonly session: WalkForwardRunSession;
  readonly context: WalkForwardContext;
  readonly searcher: CombinationSearcher;
  readonly results: SearchResults;
  readonly progress: WalkForwardProgress;
  readonly concurrency: number;
  readonly timer: PhaseTimer;
  readonly report: (percent: number) => void;
};

export type SearchPhaseResult =
  | { readonly kind: 'finished' }
  | { readonly kind: 'stopped'; readonly status: RunStatus }
  | { readonly kind: 'vanished' };

type SearchState = {
  stopped: SearchPhaseResult | undefined;
  committedSize: number;
  commitQueue: Promise<void>;
};

// Salva o resumo de tudo o que a busca já avaliou. Uma de cada vez e só quando há resultado novo: o checkpoint só
// avança (`last_candle_time` = começo do primeiro ajuste + combinações avaliadas).
async function commitSearch(params: SearchPhaseParams, state: SearchState): Promise<void> {
  if (state.stopped !== undefined || params.results.size === state.committedSize) return;
  const size = params.results.size;
  const first = params.context.windows[0];
  const committed = await commitUnit({
    session: params.session,
    checkpoint: {
      engineState: serializeSearchResults({
        requestHash: params.context.requestHash,
        results: params.results,
      }),
      lastCandleTime: (first?.trainStart ?? 0) + size,
      progress: params.progress.percent(),
    },
  });
  if (committed.kind !== 'committed') {
    state.stopped = committed;
    return;
  }
  state.committedSize = size;
  params.report(params.progress.percent());
}

async function drainQueue(
  params: SearchPhaseParams,
  state: SearchState,
  queue: number[],
): Promise<void> {
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (state.stopped !== undefined) return;
    const windows = await params.searcher.evaluate(next);
    params.results.set(next, windows);
    params.progress.advance(windows.length);
    state.commitQueue = state.commitQueue.then(() => commitSearch(params, state));
    await state.commitQueue;
  }
}

// A BUSCA: o ajuste de cada combinação ainda não avaliada, até `concurrency` ao mesmo tempo. Cada combinação
// avaliada vira checkpoint; o cancelamento é visto no checkpoint seguinte, e nenhuma combinação nova começa depois.
export async function runSearchPhase(params: SearchPhaseParams): Promise<SearchPhaseResult> {
  const pending = params.context.combinations
    .map((combination) => combination.index)
    .filter((index) => !params.results.has(index));
  const state: SearchState = {
    stopped: undefined,
    committedSize: params.results.size,
    commitQueue: Promise.resolve(),
  };
  await params.timer.measure(WALK_FORWARD_PHASE.SEARCH, () =>
    Promise.all(
      Array.from({ length: params.concurrency }, () => drainQueue(params, state, pending)),
    ),
  );
  return state.stopped ?? { kind: 'finished' };
}
