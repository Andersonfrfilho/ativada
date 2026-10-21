// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { UseInfiniteQueryResult } from '@tanstack/react-query';

import { RUN_KIND } from '../../runs/run.constant.js';
import type { Run } from '../../runs/run.validation.js';
import { useRunListQuery } from '../../runs/runs.query.js';
import type { SwitchListInput } from './run-switch-options.js';

export type SwitchLists = {
  readonly lists: readonly SwitchListInput[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly hasMore: boolean;
  readonly loadMore: () => void;
};

type ListQuery = UseInfiniteQueryResult<{ pages: readonly { items: readonly Run[] }[] }>;

function itemsOf(query: ListQuery): readonly Run[] {
  return query.data?.pages.flatMap((page) => page.items) ?? [];
}

// Uma consulta por tipo, com as MESMAS chaves da tela de Backtests: o cache já carregado lá é reaproveitado, sem N+1.
export function useRunSwitchLists(symbol: string | undefined, isEnabled: boolean): SwitchLists {
  const live = useRunListQuery(RUN_KIND.LIVE_PAPER, symbol, isEnabled);
  const backtest = useRunListQuery(RUN_KIND.BACKTEST, symbol, isEnabled);
  const walkForward = useRunListQuery(RUN_KIND.WALK_FORWARD, symbol, isEnabled);
  const queries = [live, backtest, walkForward];
  return {
    lists: [
      { kind: RUN_KIND.LIVE_PAPER, runs: itemsOf(live) },
      { kind: RUN_KIND.BACKTEST, runs: itemsOf(backtest) },
      { kind: RUN_KIND.WALK_FORWARD, runs: itemsOf(walkForward) },
    ],
    isPending: isEnabled && queries.some((query) => query.isPending),
    isError: queries.some((query) => query.isError),
    hasMore: queries.some((query) => query.hasNextPage),
    loadMore: (): void => {
      for (const query of queries) if (query.hasNextPage) void query.fetchNextPage();
    },
  };
}
