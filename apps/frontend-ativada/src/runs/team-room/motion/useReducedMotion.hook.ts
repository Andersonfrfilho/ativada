// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useSyncExternalStore } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  const list = globalThis.matchMedia?.(REDUCED_MOTION_QUERY);
  list?.addEventListener?.('change', onChange);
  return (): void => list?.removeEventListener?.('change', onChange);
}

function snapshot(): boolean {
  return globalThis.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

// Verdadeiro quando o sistema pede menos movimento; a assinatura acompanha a mudança com a tela aberta.
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
