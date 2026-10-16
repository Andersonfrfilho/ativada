// Copyright (c) 2026 Ada Technology. All rights reserved.
// Com poucas velas a janela encolhe até elas (mais a folga da direita): nada de três quartos do gráfico vazios à esquerda.
export function computeLastBarsWidth(params: {
  readonly candleCount: number;
  readonly bars: number;
  readonly rightMarginBars: number;
}): number {
  return Math.min(params.bars, params.candleCount + params.rightMarginBars);
}
