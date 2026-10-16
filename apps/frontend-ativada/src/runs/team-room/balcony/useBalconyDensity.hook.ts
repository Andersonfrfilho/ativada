// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useState } from 'react';

import {
  DENSITY,
  DENSITY_STORAGE_KEY,
  readChoice,
  resolveDensity,
  type Density,
  type DensityChoice,
} from './balcony-density.js';

export type BalconyDensity = {
  readonly density: Density;
  readonly isForced: boolean;
  readonly toggle: () => void;
  readonly expand: () => void;
};

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

// Compacto ou confortável: o padrão vem da altura da janela (acompanha o redimensionamento e o zoom) e a escolha fica no navegador.
export function useBalconyDensity(): BalconyDensity {
  const [choice, setChoice] = useState<DensityChoice>(() => readChoice(storage()));
  const [height, setHeight] = useState(() => globalThis.innerHeight);
  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(() => {
    const update = (): void => setHeight(globalThis.innerHeight);
    globalThis.addEventListener('resize', update);
    return (): void => globalThis.removeEventListener('resize', update);
  }, []);
  const resolved = resolveDensity(choice, height);
  const density = resolved === DENSITY.COLLAPSED && isExpanded ? DENSITY.COMPACT : resolved;
  function toggle(): void {
    const next = density === DENSITY.COMFORTABLE ? DENSITY.COMPACT : DENSITY.COMFORTABLE;
    setChoice(next);
    setIsExpanded(false);
    try {
      storage()?.setItem(DENSITY_STORAGE_KEY, next);
    } catch {
      // armazenamento negado: a escolha vale só nesta tela
    }
  }
  return { density, isForced: choice !== 'auto', toggle, expand: () => setIsExpanded((v) => !v) };
}
