// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import controls from '../styles/Controls.module.css';
import { DistributionFigures } from './DistributionFigures.component.js';
import type { DailyRowData } from './horizon.validation.js';
import styles from './Horizons.module.css';
import { RecommendedBadge } from './RecommendedBadge.component.js';

export type DailyHorizonRowProps = { readonly row: DailyRowData };

export function DailyHorizonRow({ row }: DailyHorizonRowProps): ReactElement {
  const className = row.isRecommended ? `${styles.row} ${styles.rowRecommended}` : styles.row;
  return (
    <li className={className}>
      <div className={styles.head}>
        <h3 className={styles.rowTitle}>{row.horizonDays} dias</h3>
        {row.isRecommended ? <RecommendedBadge /> : null}
        {row.isShortHistory ? <span className={styles.tag}>Histórico curto</span> : null}
      </div>
      <p className={styles.message}>{row.message}</p>
      <p className={controls.muted}>
        {row.strategy.name} · versão {row.strategy.version}
      </p>
      <DistributionFigures
        label={`${row.horizonDays} dias com a estratégia`}
        distribution={row}
        windowNote={` (${row.positiveCount} de ${row.windowCount})`}
      />
      <p className={styles.caption}>Se só tivesse comprado e esperado (comprar e segurar)</p>
      <DistributionFigures
        label={`${row.horizonDays} dias comprando e segurando`}
        distribution={row.benchmark}
      />
    </li>
  );
}
