// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useSearchParams } from 'react-router';

import { formatRangeParam, parseRangeParam, type ChartRange } from './chart-range.js';
import type { SelectionPlan } from './trade-selection.js';

export const RANGE_FROM_PARAM = 'de';
export const RANGE_TO_PARAM = 'ate';
export const OPERATION_PARAM = 'operacao';

export type TradeSelection = {
  readonly range: ChartRange | undefined;
  // Pronto para espalhar na consulta: sem faixa na URL não manda `from` nem `to`.
  readonly queryRange: { readonly from?: number; readonly to?: number };
  // A operação selecionada (`?operacao=<engineKey>`), a mesma chave da linha da tabela e das setas.
  readonly selectedKey: string | undefined;
  readonly setRange: (range: ChartRange | undefined) => void;
  readonly select: (plan: SelectionPlan) => void;
};

function writeRange(params: URLSearchParams, range: ChartRange | undefined): URLSearchParams {
  params.delete(RANGE_FROM_PARAM);
  params.delete(RANGE_TO_PARAM);
  if (range !== undefined) {
    params.set(RANGE_FROM_PARAM, formatRangeParam(range.from));
    params.set(RANGE_TO_PARAM, formatRangeParam(range.to));
  }
  return params;
}

// A faixa visível e a operação selecionada moram na URL: o link se compartilha e o "voltar" do navegador as restaura.
export function useTradeSelection(): TradeSelection {
  const [searchParams, setSearchParams] = useSearchParams();
  const from = parseRangeParam(searchParams.get(RANGE_FROM_PARAM));
  const to = parseRangeParam(searchParams.get(RANGE_TO_PARAM));
  const range = from !== undefined && to !== undefined && from < to ? { from, to } : undefined;
  const selectedKey = searchParams.get(OPERATION_PARAM) ?? undefined;
  return {
    range,
    queryRange: range === undefined ? {} : { from: range.from, to: range.to },
    selectedKey: selectedKey === '' ? undefined : selectedKey,
    setRange: (next): void =>
      setSearchParams((current) => writeRange(new URLSearchParams(current), next)),
    select: (plan): void =>
      setSearchParams((current) => {
        const params = new URLSearchParams(current);
        params.set(OPERATION_PARAM, plan.key);
        return plan.range === undefined ? params : writeRange(params, plan.range);
      }),
  };
}
