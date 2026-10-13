// Copyright (c) 2026 Ada Technology. All rights reserved.
export const CHART_ITEM_ATTRIBUTE = 'data-chart-item';

const ARROW_STEP: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 };

export function arrowStep(key: string): number | undefined {
  return ARROW_STEP[key];
}

// Os itens estão no DOM em ordem de tempo, então andar pelo DOM é andar no tempo.
export function moveChartFocus(container: Element, step: number): void {
  const items = Array.from(container.querySelectorAll<SVGElement>(`[${CHART_ITEM_ATTRIBUTE}]`));
  const current = items.findIndex((item) => item === document.activeElement);
  const target = items[current === -1 ? 0 : current + step];
  target?.focus();
}
