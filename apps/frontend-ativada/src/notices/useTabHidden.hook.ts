// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useSyncExternalStore } from 'react';

function subscribe(listener: () => void): () => void {
  document.addEventListener('visibilitychange', listener);
  return (): void => document.removeEventListener('visibilitychange', listener);
}

const readHidden = (): boolean => document.visibilityState === 'hidden';

// A aba está escondida (outra aba ou janela minimizada): é quando o título e a notificação do navegador valem.
export function useTabHidden(): boolean {
  return useSyncExternalStore(subscribe, readHidden, () => false);
}
