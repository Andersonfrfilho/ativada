// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon, type IconName } from '../layout/Icon.component.js';
import {
  describeVariation,
  directionOf,
  formatVariation,
  type VariationDirection,
  type WindowVariation,
} from './price-variation.js';
import { usePriceVariation } from './usePriceVariation.hook.js';
import styles from './PriceVariation.module.css';

export type PriceVariationProps = { readonly symbol: string };

const DIRECTION_ICON: Record<VariationDirection, IconName> = {
  up: 'arrowUp',
  down: 'arrowDown',
  flat: 'equal',
};

const DIRECTION_CLASS: Record<VariationDirection, string | undefined> = {
  up: styles.up,
  down: styles.down,
  flat: styles.flat,
};

function VariationChip({ variation }: { readonly variation: WindowVariation }): ReactElement {
  const { hundredths, window, reason } = variation;
  if (hundredths === undefined) {
    return (
      <li className={`${styles.chip} ${styles.missing}`} aria-label={describeVariation(variation)}>
        <span title={reason}>
          {window.label} <span aria-hidden="true">—</span>
        </span>
      </li>
    );
  }
  const direction = directionOf(hundredths);
  return (
    <li
      className={`${styles.chip} ${DIRECTION_CLASS[direction] ?? ''}`}
      aria-label={describeVariation(variation)}
    >
      <span className={styles.window}>{window.label}</span>
      <Icon name={DIRECTION_ICON[direction]} size={14} />
      <strong>{formatVariation(hundredths)}</strong>
    </li>
  );
}

// Quanto o preço variou em cada janela. É histórico recente: "Tendência, não promessa."
export function PriceVariation({ symbol }: PriceVariationProps): ReactElement {
  const variations = usePriceVariation(symbol);
  return (
    <ul className={styles.row} aria-label="Variação do preço por período">
      {variations.map((variation) => (
        <VariationChip key={variation.window.key} variation={variation} />
      ))}
    </ul>
  );
}
