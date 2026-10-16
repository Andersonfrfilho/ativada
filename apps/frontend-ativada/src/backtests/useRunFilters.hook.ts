// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useSearchParams } from 'react-router';

import { useAppConfig } from '../app/useAppContext.hook.js';
import { RUN_KIND, type RunKind } from '../runs/run.constant.js';

export const SYMBOL_PARAM = 'par';
export const KIND_PARAM = 'tipo';

const LISTED_KINDS: readonly RunKind[] = [RUN_KIND.BACKTEST, RUN_KIND.WALK_FORWARD];

export type RunFilters = {
  readonly symbol: string | undefined;
  readonly kind: RunKind | undefined;
  readonly setSymbol: (symbol: string | undefined) => void;
  readonly setKind: (kind: RunKind | undefined) => void;
};

// Par e tipo moram na URL (link compartilhável) e seguem para a API: filtrar só o que já foi carregado esconderia o resto.
export function useRunFilters(): RunFilters {
  const { marketSymbols } = useAppConfig();
  const [params, setParams] = useSearchParams();
  const symbolParam = params.get(SYMBOL_PARAM);
  const kindParam = params.get(KIND_PARAM);
  const symbol = marketSymbols.find((candidate) => candidate === symbolParam);
  const kind = LISTED_KINDS.find((candidate) => candidate === kindParam);

  function write(name: string, value: string | undefined): void {
    setParams(
      (previous) => {
        const updated = new URLSearchParams(previous);
        if (value === undefined) updated.delete(name);
        else updated.set(name, value);
        return updated;
      },
      { replace: true },
    );
  }

  return {
    symbol,
    kind,
    setSymbol: (next) => write(SYMBOL_PARAM, next),
    setKind: (next) => write(KIND_PARAM, next),
  };
}
