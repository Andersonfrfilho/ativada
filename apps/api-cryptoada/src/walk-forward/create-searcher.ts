// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Engine } from '@cryptoada/strategy-engine';

import { buildEvaluationContext, evaluateCombination } from './evaluate-combination.js';
import type { CombinationSearcher, SearchInput } from './search-input.js';
import { createThreadedSearcher } from './search-thread-pool.js';

const SEARCH_WORKER_URL = new URL('./search.worker.ts', import.meta.url).href;

function createLocalSearcher(input: SearchInput, engine: Engine | undefined): CombinationSearcher {
  const context = buildEvaluationContext(input, engine);
  return {
    evaluate: (combinationIndex) =>
      Promise.resolve(evaluateCombination(context, input.strategies[combinationIndex])),
    close: () => Promise.resolve(),
  };
}

// `threads` indefinido roda no próprio fio (testes e o coordenador de uma thread só); com número, uma piscina de
// threads de busca. O resultado é o mesmo: a busca é uma função pura da combinação.
export function createSearcher(params: {
  readonly input: SearchInput;
  readonly threads: number | undefined;
  // O motor injetado só vale no próprio fio: uma thread cria o dela.
  readonly engine?: Engine | undefined;
}): CombinationSearcher {
  if (params.threads === undefined) return createLocalSearcher(params.input, params.engine);
  return createThreadedSearcher({
    input: params.input,
    threads: params.threads,
    workerUrl: SEARCH_WORKER_URL,
  });
}
