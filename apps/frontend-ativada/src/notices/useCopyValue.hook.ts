// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useCallback, useEffect, useRef, useState } from 'react';

const COPIED_MILLISECONDS = 2_000;

export type CopyValue = {
  // O que acabou de ser copiado (para o "Copiado" ✓ por 2 s) ou nada.
  readonly copiedKey: string | undefined;
  readonly copy: (params: { readonly key: string; readonly text: string }) => Promise<void>;
};

// Copia pelo navegador e mostra "Copiado" por 2 s; sem permissão da área de transferência, o retorno não aparece (nada finge).
export function useCopyValue(announce: (text: string) => void): CopyValue {
  const [copiedKey, setCopiedKey] = useState<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => (): void => {
      if (timer.current !== undefined) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (params: { readonly key: string; readonly text: string }): Promise<void> => {
      try {
        await navigator.clipboard.writeText(params.text);
      } catch {
        return;
      }
      setCopiedKey(params.key);
      announce('Copiado');
      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopiedKey(undefined), COPIED_MILLISECONDS);
    },
    [announce],
  );
  return { copiedKey, copy };
}
