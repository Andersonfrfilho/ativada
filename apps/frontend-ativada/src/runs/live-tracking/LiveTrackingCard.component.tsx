// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { zoneLabel } from '../../format/zoned-time.js';
import { Card } from '../../layout/Card.component.js';
import type { RunDetail } from '../run.validation.js';
import { formatDayAndTime } from './goal-text.js';
import { LiveBalanceBlock } from './LiveBalanceBlock.component.js';
import type { LiveStatus } from './live-status.validation.js';
import styles from './LiveTracking.module.css';
import { LiveTradesState } from './LiveTradesState.component.js';
import { PriceRangeBlock } from './PriceRangeBlock.component.js';
import { LiveTrackingNotices } from './LiveTrackingNotices.component.js';

export const TRACKING_ANCHOR = 'acompanhamento';

export type LiveTrackingCardProps = { readonly run: RunDetail; readonly status: LiveStatus };

// O cartão "Acompanhamento" (RF01): saldo, resultado, comparação com comprar e segurar e o porquê de não haver compra.
export function LiveTrackingCard({ run, status }: LiveTrackingCardProps): ReactElement {
  const timeZone = useUserTimeZone();
  const since = formatDayAndTime(status.run.periodStart, timeZone);
  return (
    <Card
      id={TRACKING_ANCHOR}
      title="Acompanhamento"
      icon="activity"
      aside={
        <span className={`${styles.muted} ${styles.small}`}>
          desde {since} · horários em {zoneLabel(timeZone, Date.now())}
        </span>
      }
    >
      <LiveBalanceBlock status={status} />
      {status.priceRange == null ? null : <PriceRangeBlock range={status.priceRange} />}
      <LiveTradesState run={run} status={status} />
      <LiveTrackingNotices timeframe={status.run.timeframe} />
    </Card>
  );
}
