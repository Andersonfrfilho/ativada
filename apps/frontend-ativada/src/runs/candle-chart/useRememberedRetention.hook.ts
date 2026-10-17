// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState } from 'react';

// O corte da retenção só chega com as velas de exibição; guardado, vale também depois que a pessoa volta para a vela da execução.
export function useRememberedRetention(current: number | undefined): number | undefined {
  const [remembered, setRemembered] = useState<number | undefined>(undefined);
  if (current !== undefined && current !== remembered) setRemembered(current);
  return current ?? remembered;
}
