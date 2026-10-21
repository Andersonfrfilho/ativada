// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useLayoutEffect, type RefObject } from 'react';

import { depthOf, type Point } from './office-geometry.js';

// Posição na cena por variáveis CSS (`--x`, `--y`, `--z`) escritas no elemento, como o balão do gráfico: nada de `style=`
// no JSX. O CSS converte unidades de desenho em porcentagem da cena.
export function usePlacement(ref: RefObject<HTMLElement | null>, point: Point): void {
  const { x, y } = point;
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    element.style.setProperty('--x', String(x));
    element.style.setProperty('--y', String(y));
    element.style.setProperty('--z', String(depthOf(y)));
  }, [ref, x, y]);
}
