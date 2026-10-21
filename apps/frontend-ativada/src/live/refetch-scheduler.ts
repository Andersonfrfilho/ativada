// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Query, QueryClient } from '@tanstack/react-query';

export const REFETCH_DEBOUNCE_MILLISECONDS = 500;

const SECTION_KEY_POSITION = 2;
const CURSOR_KEY_POSITION = 3;
const DECISIONS_KEY = 'decisions';
const PROJECTIONS_KEY = 'projections';

export type RefetchScheduler = {
  readonly schedule: (root: string) => void;
  readonly cancel: () => void;
};

export const isDecisionsKey = (queryKey: readonly unknown[]): boolean =>
  queryKey[SECTION_KEY_POSITION] === DECISIONS_KEY;

// As páginas por cursor das previsões (a primeira página não tem cursor na chave).
export const isProjectionsPageKey = (queryKey: readonly unknown[]): boolean =>
  queryKey[SECTION_KEY_POSITION] === PROJECTIONS_KEY && queryKey[CURSOR_KEY_POSITION] !== undefined;

const isOlderPageQuery = (query: Query): boolean =>
  isDecisionsKey(query.queryKey) || isProjectionsPageKey(query.queryKey);

// As páginas antigas de decisões e de previsões só ficam obsoletas (o `live-status` e a primeira página mais novos vencem
// na junção): refazê-las a cada vela multiplicaria os pedidos pelo número de páginas abertas e os limites são de 60 por minuto.
function invalidateRoot(queryClient: QueryClient, root: string): void {
  void queryClient.invalidateQueries({
    queryKey: [root],
    predicate: (query) => !isOlderPageQuery(query),
  });
  void queryClient.invalidateQueries({
    queryKey: [root],
    predicate: isOlderPageQuery,
    refetchType: 'none',
  });
}

// Uma rajada de avisos do mesmo assunto vira uma só rebusca, meio segundo depois do último aviso.
export function createRefetchScheduler(queryClient: QueryClient): RefetchScheduler {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return {
    schedule: (root): void => {
      const pending = timers.get(root);
      if (pending !== undefined) clearTimeout(pending);
      timers.set(
        root,
        setTimeout(() => {
          timers.delete(root);
          invalidateRoot(queryClient, root);
        }, REFETCH_DEBOUNCE_MILLISECONDS),
      );
    },
    cancel: (): void => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}
