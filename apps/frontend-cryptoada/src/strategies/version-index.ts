// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { VersionLabel } from './strategy.validation.js';

// `isComplete` é falso quando alguma estratégia (ou página dela) não pôde ser lida: um id ausente então NÃO prova remoção.
export type VersionIndex = {
  readonly labels: ReadonlyMap<string, VersionLabel>;
  readonly isComplete: boolean;
};

export type VersionLookup =
  | { readonly kind: 'found'; readonly label: VersionLabel }
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'removed' };

export type VersionIndexState = {
  readonly data: VersionIndex | undefined;
  readonly isPending: boolean;
  readonly isError: boolean;
};

export function lookupVersion(state: VersionIndexState, versionId: string): VersionLookup {
  const label = state.data?.labels.get(versionId);
  if (label !== undefined) return { kind: 'found', label };
  if (state.data === undefined) return { kind: state.isError ? 'unavailable' : 'loading' };
  return { kind: state.data.isComplete ? 'removed' : 'unavailable' };
}

export function describeLookup(lookup: VersionLookup): string {
  if (lookup.kind === 'found') {
    return `${lookup.label.strategyName} · versão ${lookup.label.version}`;
  }
  if (lookup.kind === 'loading') return 'Carregando estratégia…';
  return lookup.kind === 'unavailable' ? 'Estratégia indisponível agora' : 'Estratégia removida';
}
