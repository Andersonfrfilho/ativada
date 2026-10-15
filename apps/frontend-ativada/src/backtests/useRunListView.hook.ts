// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useSearchParams } from 'react-router';

import { RESULT_ORDER, type ResultOrder } from './run-groups.js';

export const STRATEGY_PARAM = 'strategy';
export const ORDER_PARAM = 'order';

const NEXT_ORDER: Readonly<Record<ResultOrder, ResultOrder>> = {
  desc: RESULT_ORDER.ASC,
  asc: RESULT_ORDER.NONE,
  none: RESULT_ORDER.DESC,
};

function readOrder(value: string | null): ResultOrder {
  return value === RESULT_ORDER.ASC || value === RESULT_ORDER.NONE ? value : RESULT_ORDER.DESC;
}

export type RunListView = {
  readonly strategies: readonly string[];
  readonly order: ResultOrder;
  readonly toggleStrategy: (key: string, allKeys: readonly string[]) => void;
  readonly cycleOrder: () => void;
};

// Filtro por estratégia e ordem do resultado moram na URL: o link compartilha a visão e o voltar do navegador a desfaz.
export function useRunListView(): RunListView {
  const [params, setParams] = useSearchParams();
  const strategies = params.getAll(STRATEGY_PARAM);
  const order = readOrder(params.get(ORDER_PARAM));

  function toggleStrategy(key: string, allKeys: readonly string[]): void {
    const current = strategies.length === 0 ? allKeys : strategies;
    const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
    if (next.length === 0) return;
    setParams(
      (previous) => {
        const updated = new URLSearchParams(previous);
        updated.delete(STRATEGY_PARAM);
        if (next.length < allKeys.length) {
          next.forEach((item) => updated.append(STRATEGY_PARAM, item));
        }
        return updated;
      },
      { replace: true },
    );
  }

  function cycleOrder(): void {
    const next = NEXT_ORDER[order];
    setParams(
      (previous) => {
        const updated = new URLSearchParams(previous);
        if (next === RESULT_ORDER.DESC) updated.delete(ORDER_PARAM);
        else updated.set(ORDER_PARAM, next);
        return updated;
      },
      { replace: true },
    );
  }

  return { strategies, order, toggleStrategy, cycleOrder };
}
