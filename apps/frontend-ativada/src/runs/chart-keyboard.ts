// Copyright (c) 2026 Ada Technology. All rights reserved.
export const CHART_ITEM_ATTRIBUTE = 'data-chart-item';

// Quanto andar: um passo no tempo ou até a primeira/última marca.
export type ChartMove = number | 'first' | 'last';

const KEY_MOVE: Readonly<Record<string, ChartMove>> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  Home: 'first',
  End: 'last',
};

export function chartMoveFor(key: string): ChartMove | undefined {
  return KEY_MOVE[key];
}

function targetIndex(move: ChartMove, current: number, count: number): number {
  if (move === 'first') return 0;
  if (move === 'last') return count - 1;
  return current === -1 ? 0 : current + move;
}

// Os itens estão no DOM em ordem de tempo, então andar pelo DOM é andar no tempo.
export function moveChartFocus(container: Element, move: ChartMove): void {
  const items = Array.from(container.querySelectorAll<SVGElement>(`[${CHART_ITEM_ATTRIBUTE}]`));
  const current = items.findIndex((item) => item === document.activeElement);
  items[targetIndex(move, current, items.length)]?.focus();
}
