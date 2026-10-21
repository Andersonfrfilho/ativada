// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState } from 'react';

import { pickDefaultFeatured, type LiveSimulation } from './live-simulations.js';
import type { Run } from './overview.validation.js';

export const FEATURED_RUN_STORAGE_KEY = 'ativada.overview.featured-run';

// O acesso ao `localStorage` pode lançar (janela privada, dados do site bloqueados): sem ele, vale o padrão.
function readStoredId(): string | undefined {
  try {
    return globalThis.localStorage.getItem(FEATURED_RUN_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function storeId(runId: string): void {
  try {
    globalThis.localStorage.setItem(FEATURED_RUN_STORAGE_KEY, runId);
  } catch {
    // Sem armazenamento a escolha vale só nesta visita.
  }
}

export type FeaturedRun = {
  readonly featured: Run | undefined;
  readonly select: (runId: string) => void;
};

// A simulação em destaque alimenta o cartão-herói e o gráfico de saldo. A escolha lembrada só vale enquanto a simulação
// ainda está ativa; depois disso volta ao padrão (a mais recente que já operou).
export function useFeaturedRun(simulations: readonly LiveSimulation[]): FeaturedRun {
  const [chosenId, setChosenId] = useState(readStoredId);
  const chosen = simulations.find((simulation) => simulation.run.id === chosenId)?.run;
  return {
    featured: chosen ?? pickDefaultFeatured(simulations),
    select: (runId): void => {
      storeId(runId);
      setChosenId(runId);
    },
  };
}
