// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_KIND } from '../../runs/run.constant.js';
import { useRunListQuery } from '../../runs/runs.query.js';
import type { Run } from '../../runs/run.validation.js';
import { findNeighbours } from './run-switch-order.js';
import { SWITCH_GROUPS } from './run-switch.constant.js';

export type RunNeighbours = {
  readonly previousId: string | undefined;
  readonly nextId: string | undefined;
  // O fim da lista carregada, com mais páginas na API: "próxima" busca a página e vai para a primeira nova.
  readonly canLoadNext: boolean;
  readonly loadNext: () => Promise<string | undefined>;
};

const NONE: RunNeighbours = {
  previousId: undefined,
  nextId: undefined,
  canLoadNext: false,
  loadNext: () => Promise.resolve(undefined),
};

// Anterior e próxima seguem a lista da mesma moeda e do mesmo tipo (a chave de cache é a da tela de Backtests).
export function useRunNeighbours(run: Run | undefined): RunNeighbours {
  const kind = SWITCH_GROUPS.find((group) => group.kind === run?.kind)?.kind;
  const list = useRunListQuery(kind ?? RUN_KIND.BACKTEST, run?.symbol, kind !== undefined);
  if (run === undefined || kind === undefined) return NONE;
  const ids = list.data?.pages.flatMap((page) => page.items.map((item) => item.id)) ?? [];
  const found = findNeighbours(ids, run.id);
  return {
    previousId: found.previousId,
    nextId: found.nextId,
    canLoadNext: found.isFound && found.nextId === undefined && list.hasNextPage,
    loadNext: async (): Promise<string | undefined> => {
      const result = await list.fetchNextPage();
      const loaded = result.data?.pages.flatMap((page) => page.items.map((item) => item.id)) ?? [];
      return findNeighbours(loaded, run.id).nextId;
    },
  };
}
