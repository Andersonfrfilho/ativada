// Copyright (c) 2026 Ada Technology. All rights reserved.
export type Neighbours = {
  readonly isFound: boolean;
  readonly previousId: string | undefined;
  readonly nextId: string | undefined;
};

// A ordem é a da lista: "anterior" sobe (mais nova) e "próxima" desce (mais antiga).
export function findNeighbours(ids: readonly string[], currentId: string): Neighbours {
  const index = ids.indexOf(currentId);
  if (index === -1) return { isFound: false, previousId: undefined, nextId: undefined };
  return { isFound: true, previousId: ids[index - 1], nextId: ids[index + 1] };
}

// Setas andam pela lista e dão a volta nas pontas; qualquer outra tecla não mexe na opção ativa.
export function nextActiveIndex(key: string, current: number, count: number): number | undefined {
  if (count === 0 || (key !== 'ArrowDown' && key !== 'ArrowUp')) return undefined;
  const delta = key === 'ArrowDown' ? 1 : -1;
  return (current + delta + count) % count;
}
