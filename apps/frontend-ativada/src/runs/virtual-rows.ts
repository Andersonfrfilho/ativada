// Copyright (c) 2026 Ada Technology. All rights reserved.
// Altura fixa da linha e da janela: o CSS da tabela (`TradesTable.module.css`) usa os mesmos números.
export const ROW_HEIGHT = 44;
export const TABLE_VIEWPORT_HEIGHT = 440;
export const ROW_OVERSCAN = 6;

export type VisibleRowsParams = {
  readonly rowHeight: number;
  readonly viewportHeight: number;
  readonly scrollTop: number;
  readonly total: number;
  // Linhas extras desenhadas acima e abaixo da janela, para a rolagem rápida não mostrar vazio.
  readonly overscan: number;
};

// `first` entra e `end` não. Os espaçadores somam, com as linhas desenhadas, a altura de `total` linhas.
export type VisibleRows = {
  readonly first: number;
  readonly end: number;
  readonly padTop: number;
  readonly padBottom: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

// Quais linhas desenhar: só a janela e a margem; o resto vira dois espaçadores de altura (aria-rowindex mantém o lugar).
export function computeVisibleRows(params: VisibleRowsParams): VisibleRows {
  const { rowHeight, viewportHeight, scrollTop, total, overscan } = params;
  if (total <= 0 || rowHeight <= 0) return { first: 0, end: 0, padTop: 0, padBottom: 0 };
  const maximumTop = Math.max(0, total * rowHeight - viewportHeight);
  const top = clamp(Number.isFinite(scrollTop) ? scrollTop : 0, 0, maximumTop);
  const firstSeen = Math.floor(top / rowHeight);
  const endSeen = Math.ceil((top + viewportHeight) / rowHeight);
  const first = clamp(firstSeen - overscan, 0, total);
  const end = clamp(endSeen + overscan, first, total);
  return { first, end, padTop: first * rowHeight, padBottom: (total - end) * rowHeight };
}

export type RevealParams = {
  readonly index: number;
  readonly scrollTop: number;
  readonly rowHeight: number;
  readonly viewportHeight: number;
};

// A rolagem que põe a linha no meio da janela; `undefined` quando ela já está folgada à vista (uma linha de margem).
export function scrollTopToReveal(params: RevealParams): number | undefined {
  const { index, scrollTop, rowHeight, viewportHeight } = params;
  const rowTop = index * rowHeight;
  const isComfortable =
    rowTop >= scrollTop + rowHeight && rowTop + 2 * rowHeight <= scrollTop + viewportHeight;
  if (isComfortable) return undefined;
  return Math.max(0, rowTop - (viewportHeight - rowHeight) / 2);
}
