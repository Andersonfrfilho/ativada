// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createContext } from 'react';

import type { ChartSurfaceFactory } from './chart-surface.types.js';

// A biblioteca de desenho pesa ~58 KB gzip e só o detalhe da execução a usa: o adaptador vira um pedaço próprio do build,
// carregado quando o gráfico aparece. Os testes trocam o carregador pela superfície falsa.
export type ChartSurfaceLoader = () => Promise<ChartSurfaceFactory>;

export async function loadLightweightSurface(): Promise<ChartSurfaceFactory> {
  const adapter = await import('./lightweight-surface.js');
  return adapter.createLightweightSurface;
}

export const ChartSurfaceLoaderContext = createContext<ChartSurfaceLoader>(loadLightweightSurface);
