// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useTradesQuery, type TradesFilters } from './runs.query.js';
import type { Trade } from './run.validation.js';

export type TradeRows = {
  // As abertas primeiro (`status=open`), depois as fechadas na ordem do servidor.
  readonly items: readonly Trade[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly hasMore: boolean;
  readonly fetchMore: () => void;
};

export type TradeRangeFilter = Pick<TradesFilters, 'from' | 'to'>;

// A tabela segue a faixa do gráfico: as abertas numa consulta só e as fechadas paginadas por cursor.
export function useTradeRows(runId: string, range: TradeRangeFilter): TradeRows {
  const open = useTradesQuery(runId, { ...range, status: 'open' });
  const closed = useTradesQuery(runId, { ...range, status: 'closed' });
  const openItems = open.data?.pages[0]?.items ?? [];
  const closedItems = closed.data?.pages.flatMap((page) => page.items) ?? [];
  return {
    items: [...openItems, ...closedItems],
    isPending: open.isPending || closed.isPending,
    isError: closed.isError,
    hasMore: closed.hasNextPage,
    fetchMore: (): void => {
      if (closed.hasNextPage && !closed.isFetchingNextPage) void closed.fetchNextPage();
    },
  };
}
