// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Query, QueryClient } from '@tanstack/react-query';

export const REFETCH_DEBOUNCE_MILLISECONDS = 500;

const DECISIONS_KEY_POSITION = 2;
const DECISIONS_KEY = 'decisions';

export type RefetchScheduler = {
  readonly schedule: (root: string) => void;
  readonly cancel: () => void;
};

export const isDecisionsKey = (queryKey: readonly unknown[]): boolean =>
  queryKey[DECISIONS_KEY_POSITION] === DECISIONS_KEY;

const isDecisionsQuery = (query: Query): boolean => isDecisionsKey(query.queryKey);

// As páginas antigas de decisões só ficam obsoletas (o `live-status` mais novo vence na junção): refazê-las a cada vela
// multiplicaria os pedidos pelo número de páginas abertas e o limite de /decisions é de 60 por minuto.
function invalidateRoot(queryClient: QueryClient, root: string): void {
  void queryClient.invalidateQueries({
    queryKey: [root],
    predicate: (query) => !isDecisionsQuery(query),
  });
  void queryClient.invalidateQueries({
    queryKey: [root],
    predicate: isDecisionsQuery,
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
