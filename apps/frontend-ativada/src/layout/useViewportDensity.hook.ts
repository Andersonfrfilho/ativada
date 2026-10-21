// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect } from 'react';

// Abaixo desta altura útil o painel entra no modo "short": cabeçalho, aviso e barras do gráfico encolhem para o gráfico caber.
export const SHORT_VIEWPORT_HEIGHT = 800;

export function viewportKind(height: number): 'short' | 'tall' {
  return height < SHORT_VIEWPORT_HEIGHT ? 'short' : 'tall';
}

// Marca `data-viewport` na raiz; o CSS dos módulos reage com `:global([data-viewport='short'])`. Acompanha resize e zoom.
export function useViewportDensity(): void {
  useEffect(() => {
    const root = document.documentElement;
    const update = (): void => {
      root.dataset['viewport'] = viewportKind(globalThis.innerHeight);
    };
    update();
    globalThis.addEventListener('resize', update);
    return (): void => {
      globalThis.removeEventListener('resize', update);
      delete root.dataset['viewport'];
    };
  }, []);
}
