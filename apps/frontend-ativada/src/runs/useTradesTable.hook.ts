// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useEffectEvent } from 'react';

import { useTradeRows, type TradeRangeFilter, type TradeRows } from './useTradeRows.hook.js';
import { useVirtualRows, type VirtualRows } from './useVirtualRows.hook.js';

// Quantas linhas antes do fim da lista carregada a próxima página já é pedida.
const PREFETCH_ROWS = 30;

export type TradesTableParams = {
  readonly runId: string;
  readonly range: TradeRangeFilter;
  readonly selectedKey: string | undefined;
};

export type TradesTableState = {
  readonly rows: TradeRows;
  readonly virtual: VirtualRows;
  readonly selectedIndex: number;
};

// Liga a lista, a janela virtual e a seleção: pede mais páginas ao chegar perto do fim (ou quando a operação
// selecionada ainda não foi carregada) e rola até a linha selecionada.
export function useTradesTable(params: TradesTableParams): TradesTableState {
  const { runId, range, selectedKey } = params;
  const rows = useTradeRows(runId, range);
  const virtual = useVirtualRows(rows.items.length);
  const selectedIndex =
    selectedKey === undefined
      ? -1
      : rows.items.findIndex((trade) => trade.engineKey === selectedKey);
  const isNearEnd = virtual.visible.end >= rows.items.length - PREFETCH_ROWS;
  const isSelectionMissing = selectedKey !== undefined && selectedIndex === -1;
  const needsMore = rows.hasMore && (isNearEnd || isSelectionMissing);
  const loadMore = useEffectEvent(() => rows.fetchMore());
  const revealRow = useEffectEvent((index: number) => virtual.reveal(index));
  useEffect(() => {
    if (needsMore) loadMore();
  }, [needsMore, rows.items.length]);
  useEffect(() => {
    if (selectedIndex >= 0) revealRow(selectedIndex);
  }, [selectedIndex, selectedKey]);
  return { rows, virtual, selectedIndex };
}
