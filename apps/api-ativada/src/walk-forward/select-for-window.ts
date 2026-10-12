// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  selectBestParameters,
  type GridCombination,
  type ParameterCandidate,
  type ParameterSelection,
} from '@ativada/strategy-engine';

import { WALK_FORWARD_ERROR_CODE } from './walk-forward.constant.js';
import { WalkForwardRunError } from './walk-forward.error.js';
import type { SearchResults } from './walk-forward-checkpoint.js';
import type { WindowSummary } from './search-input.js';

export type WindowSelection = {
  readonly selection: ParameterSelection;
  readonly candidates: number;
  // A combinação que opera no teste: a escolhida, ou (carteira parada) a primeira só para dar os candles.
  readonly combination: GridCombination;
  readonly summary: WindowSummary | undefined;
};

function summaryOf(results: SearchResults, combination: number, window: number): WindowSummary {
  const summary = results.get(combination)?.[window];
  if (summary === undefined) {
    throw new WalkForwardRunError(
      WALK_FORWARD_ERROR_CODE.CHECKPOINT_UNUSABLE,
      'Falta o resumo do ajuste de uma combinação.',
    );
  }
  return summary;
}

// A ESCOLHA da janela: Sharpe líquido no AJUSTE com no mínimo `minTrades` operações fechadas; sem nenhuma
// combinação elegível a janela fica parada (nunca a "menos pior").
export function selectForWindow(params: {
  readonly combinations: readonly GridCombination[];
  readonly results: SearchResults;
  readonly windowIndex: number;
  readonly minTradesPerWindow: number;
}): WindowSelection {
  const summaries = params.combinations.map((combination) =>
    summaryOf(params.results, combination.index, params.windowIndex),
  );
  const candidates: ParameterCandidate[] = summaries.map((summary, position) => ({
    combinationIndex: params.combinations[position]?.index ?? position,
    trades: summary.trades,
    sharpe: summary.sharpe,
    maxDrawdownAtLow: summary.maxDrawdownAtLow,
  }));
  const selection = selectBestParameters({
    candidates,
    minTradesPerWindow: params.minTradesPerWindow,
  });
  const chosenIndex = selection.status === 'ok' ? selection.best.combinationIndex : 0;
  const combination = params.combinations[chosenIndex];
  if (combination === undefined) {
    throw new WalkForwardRunError(
      WALK_FORWARD_ERROR_CODE.CHECKPOINT_UNUSABLE,
      'Combinação fora da grade.',
    );
  }
  return {
    selection,
    candidates: candidates.length,
    combination,
    summary: selection.status === 'ok' ? summaries[chosenIndex] : undefined,
  };
}
