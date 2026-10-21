// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatRatePercent, ratePercentAttribute } from '../candle-chart/projection-text.js';
import type { ProjectionSummary } from '../candle-chart/projections.validation.js';
import styles from './ProjectionCards.module.css';
import { COIN_FLIP_ATTRIBUTE, STRENGTH_LABEL } from './projection-verdict.js';

type Row = ProjectionSummary['byStrength'][number];

const BAR_HEIGHT = 10;

function StrengthBar({ rate }: { readonly rate: string | null }): ReactElement {
  return (
    <svg className={styles.bar} viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
      <rect className={styles.barTrack} x="0" y="0" width="100" height={BAR_HEIGHT} />
      <rect
        className={styles.barFill}
        x="0"
        y="0"
        width={ratePercentAttribute(rate)}
        height={BAR_HEIGHT}
      />
      <line
        className={styles.barMark}
        x1={COIN_FLIP_ATTRIBUTE}
        x2={COIN_FLIP_ATTRIBUTE}
        y1="0"
        y2={BAR_HEIGHT}
      />
    </svg>
  );
}

// Acerto por força do placar, com a marca de 50% (moeda ao ar) em cada barra. O texto diz o mesmo que a barra.
export function StrengthBars({ rows }: { readonly rows: readonly Row[] }): ReactElement | null {
  const visible = rows.filter((row) => row.counted > 0);
  if (visible.length === 0) return null;
  return (
    <ul className={styles.strength} aria-label="Acerto por força do placar">
      {visible.map((row) => (
        <li key={row.strength} className={styles.strengthRow}>
          <span>{STRENGTH_LABEL[row.strength]}</span>
          <StrengthBar rate={row.hitRate} />
          <span className={styles.number}>
            {formatRatePercent(row.hitRate)} · {row.counted} previsões
          </span>
        </li>
      ))}
    </ul>
  );
}
