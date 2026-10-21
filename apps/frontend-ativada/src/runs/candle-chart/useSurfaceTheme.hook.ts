// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useSyncExternalStore, type RefObject } from 'react';

import { useTheme } from '../../theme/useTheme.hook.js';
import { buildSurfaceTheme } from './chart-theme.js';
import { createCssColorResolver } from './chart-theme-dom.js';
import type { ChartSurface } from './chart-surface.types.js';

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

function subscribeToSystemScheme(listener: () => void): () => void {
  const query = window.matchMedia(DARK_SCHEME_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

function readSystemScheme(): boolean {
  return window.matchMedia(DARK_SCHEME_QUERY).matches;
}

// As cores do gráfico são lidas dos tokens quando a superfície nasce e a cada troca de tema (a escolha do usuário ou o
// esquema do sistema, quando ele segue o sistema): o canvas não herda o CSS sozinho. Os tokens são lidos no contêiner do
// gráfico, então uma moldura que os redefine (o telão-terminal da sala, escuro nos dois temas) vale para o canvas também.
export function useSurfaceTheme(
  surface: ChartSurface | undefined,
  containerRef: RefObject<HTMLElement | null>,
): void {
  const theme = useTheme();
  const isSystemDark = useSyncExternalStore(subscribeToSystemScheme, readSystemScheme);
  useEffect(() => {
    if (surface === undefined) return;
    const root = containerRef.current ?? document.documentElement;
    surface.setTheme(buildSurfaceTheme(createCssColorResolver(root)));
  }, [surface, containerRef, theme, isSystemDark]);
}
