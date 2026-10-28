// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { formatPrice } from '../../format/format.js';
import { formatDayAndTime } from './goal-text.js';
import type { LivePriceRange } from './live-status.validation.js';
import styles from './LiveTracking.module.css';

type RangeTileProps = { readonly label: string; readonly value: string; readonly note: string };

function RangeTile({ label, value, note }: RangeTileProps): ReactElement {
  return (
    <div className={styles.kpi}>
      <p className={styles.kpiLabel}>{label}</p>
      <p className={styles.kpiValue}>
        {formatPrice(value)}
        <span className={styles.unit}>USDT</span>
      </p>
      <p className={styles.kpiNote}>{note}</p>
    </div>
  );
}

// Mínima e máxima da moeda nas velas fechadas: no período da meta e, depois de uma renovação, em todos os períodos.
export function PriceRangeBlock({ range }: { readonly range: LivePriceRange }): ReactElement {
  const timeZone = useUserTimeZone();
  const periodNote = `desde ${formatDayAndTime(range.period.from, timeZone)}`;
  const totalNote = `${range.periods} períodos, desde ${formatDayAndTime(range.total.from, timeZone)}`;
  const hasTotal = range.periods > 1;
  return (
    <section aria-label="Faixa de preço da moeda">
      <p className={styles.kpiLabel}>Faixa de preço da moeda</p>
      <div className={styles.kpis}>
        <RangeTile label="Mínima no período" value={range.period.low} note={periodNote} />
        <RangeTile label="Máxima no período" value={range.period.high} note={periodNote} />
        {hasTotal ? (
          <RangeTile label="Mínima no total" value={range.total.low} note={totalNote} />
        ) : null}
        {hasTotal ? (
          <RangeTile label="Máxima no total" value={range.total.high} note={totalNote} />
        ) : null}
      </div>
    </section>
  );
}
