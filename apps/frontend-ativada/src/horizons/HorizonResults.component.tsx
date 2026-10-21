// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import type { Horizons } from './horizon.validation.js';
import { HorizonExplainer } from './HorizonExplainer.component.js';
import { HorizonRows } from './HorizonRows.component.js';
import styles from './Horizons.module.css';

export type HorizonResultsProps = { readonly horizons: Horizons };

export function HorizonResults({ horizons }: HorizonResultsProps): ReactElement {
  const hasRecommendation = horizons.recommendedHorizonDays !== null;
  return (
    <Card title="Resultado por prazo">
      <p className={hasRecommendation ? styles.summary : `${styles.summary} ${styles.summaryNone}`}>
        {horizons.recommendationMessage}
      </p>
      {horizons.rows.length === 0 ? null : <HorizonExplainer />}
      <HorizonRows rows={horizons.rows} />
      {horizons.isStrategyListTruncated ? (
        <p className={controls.muted}>Só as estratégias mais recentes entraram na comparação.</p>
      ) : null}
    </Card>
  );
}
