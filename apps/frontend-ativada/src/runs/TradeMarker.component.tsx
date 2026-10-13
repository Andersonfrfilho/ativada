// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { KeyboardEvent, ReactElement } from 'react';

import { CHART_ITEM_ATTRIBUTE } from './chart-keyboard.js';
import { HIT_RADIUS, type MarkerPlacement } from './price-chart-markers.js';
import styles from './PriceChart.module.css';
import type { ItemHandlers } from './useActiveChartItem.hook.js';

export type TradeMarkerProps = {
  readonly placement: MarkerPlacement;
  readonly label: string;
  readonly handlers: ItemHandlers;
  readonly describedBy: string | undefined;
  readonly isSelected: boolean;
  readonly tabIndex: 0 | -1;
  readonly onSelect: () => void;
};

// Compra: seta para cima, abaixo do preço. Venda: seta para baixo, acima. Foco e dica vêm do mesmo elemento;
// clicar ou apertar Enter seleciona a operação (a linha da tabela acompanha).
export function TradeMarker({
  placement,
  label,
  handlers,
  describedBy,
  isSelected,
  tabIndex,
  onSelect,
}: TradeMarkerProps): ReactElement {
  const dataAttribute = { [CHART_ITEM_ATTRIBUTE]: placement.side };
  function handleKeyDown(event: KeyboardEvent<SVGGElement>): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect();
  }
  return (
    <g
      {...handlers}
      {...dataAttribute}
      className={`${styles.item} ${isSelected ? styles.selectedItem : ''}`}
      role="button"
      tabIndex={tabIndex}
      aria-label={label}
      aria-describedby={describedBy}
      aria-current={isSelected ? 'true' : undefined}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
    >
      <circle className={styles.hit} cx={placement.x} cy={placement.centerY} r={HIT_RADIUS} />
      <path
        className={placement.side === 'buy' ? styles.buyArrow : styles.sellArrow}
        d={placement.path}
      />
    </g>
  );
}
