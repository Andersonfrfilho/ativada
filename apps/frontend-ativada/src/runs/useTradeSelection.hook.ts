// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useSearchParams } from 'react-router';

import { formatRangeParam, parseRangeParam, type ChartRange } from './chart-range.js';

export const RANGE_FROM_PARAM = 'de';
export const RANGE_TO_PARAM = 'ate';

export type TradeSelection = {
  readonly range: ChartRange | undefined;
  // Pronto para espalhar na consulta: sem faixa na URL não manda `from` nem `to`.
  readonly queryRange: { readonly from?: number; readonly to?: number };
  readonly setRange: (range: ChartRange | undefined) => void;
};

// A faixa visível mora na URL (`?de=&ate=`): o link se compartilha e o "voltar" do navegador a restaura.
export function useTradeSelection(): TradeSelection {
  const [searchParams, setSearchParams] = useSearchParams();
  const from = parseRangeParam(searchParams.get(RANGE_FROM_PARAM));
  const to = parseRangeParam(searchParams.get(RANGE_TO_PARAM));
  const range = from !== undefined && to !== undefined && from < to ? { from, to } : undefined;
  return {
    range,
    queryRange: range === undefined ? {} : { from: range.from, to: range.to },
    setRange: (next): void =>
      setSearchParams((current) => {
        const params = new URLSearchParams(current);
        params.delete(RANGE_FROM_PARAM);
        params.delete(RANGE_TO_PARAM);
        if (next !== undefined) {
          params.set(RANGE_FROM_PARAM, formatRangeParam(next.from));
          params.set(RANGE_TO_PARAM, formatRangeParam(next.to));
        }
        return params;
      }),
  };
}
