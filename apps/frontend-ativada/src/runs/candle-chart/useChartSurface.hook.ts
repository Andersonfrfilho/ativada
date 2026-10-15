// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useContext, useEffect, useRef, useState, type RefObject } from 'react';

import { ChartSurfaceLoaderContext } from './chart-surface-loader.js';
import type { ChartSurface } from './chart-surface.types.js';

export type ChartSurfaceHandle = {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  // Aparece depois que o adaptador carrega; some quando o componente sai ou o efeito recomeça.
  readonly surface: ChartSurface | undefined;
  readonly hasFailed: boolean;
};

// Dono do ciclo de vida: cria a superfície no contêiner e a destrói na saída. O StrictMode monta, desmonta e monta de
// novo; a criação que terminar depois da saída é descartada e a destruição acontece uma vez só por superfície criada.
export function useChartSurface(): ChartSurfaceHandle {
  const loader = useContext(ChartSurfaceLoaderContext);
  const containerRef = useRef<HTMLDivElement>(null);
  const [surface, setSurface] = useState<ChartSurface | undefined>(undefined);
  const [hasFailed, setHasFailed] = useState(false);
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;
    let isActive = true;
    let created: ChartSurface | undefined;
    async function create(target: HTMLElement): Promise<void> {
      try {
        const factory = await loader();
        if (!isActive) return;
        created = factory(target);
        setSurface(created);
      } catch {
        if (isActive) setHasFailed(true);
      }
    }
    void create(container);
    return (): void => {
      isActive = false;
      created?.destroy();
      setSurface(undefined);
    };
  }, [loader]);
  return { containerRef, surface, hasFailed };
}
