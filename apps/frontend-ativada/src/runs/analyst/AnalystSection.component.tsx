// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { AnalystCard } from './AnalystCard.component.js';
import { AnalystHistory } from './AnalystHistory.component.js';

// O analista de risco no detalhe da simulação ao vivo: o cartão e o histórico (nada aparece sem analista na simulação).
export function AnalystSection({ runId }: { readonly runId: string }): ReactElement {
  return (
    <>
      <AnalystCard runId={runId} />
      <AnalystHistory runId={runId} />
    </>
  );
}
