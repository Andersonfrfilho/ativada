// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { ROUTE_PATH } from '../../app/app.constant.js';
import { formatMomentSkippingToday } from '../../format/zoned-moment.js';
import { useClock } from '../../live/useClock.hook.js';
import { OUTCOME_WORD } from './live-pulse.js';
import { useLiveStatusQuery } from './live-status.query.js';
import styles from './LiveTracking.module.css';
import { TRACKING_ANCHOR } from './LiveTrackingCard.component.js';

const CLOCK_MILLISECONDS = 60_000;

// Na Visão geral (RF11): a última decisão em uma frase, com a razão do servidor, e o caminho para o acompanhamento completo.
export function LastDecisionLine({ runId }: { readonly runId: string }): ReactElement | null {
  const timeZone = useUserTimeZone();
  const now = useClock(CLOCK_MILLISECONDS);
  const decision = useLiveStatusQuery(runId, true).data?.decisions.items[0];
  if (decision === undefined) return null;
  const when = formatMomentSkippingToday(decision.closedAt, { now, timeZone });
  return (
    <>
      <p>
        <strong>Última decisão:</strong> {OUTCOME_WORD[decision.outcome]} às {when}.{' '}
        {decision.message}
      </p>
      <Link
        to={{ pathname: `${ROUTE_PATH.BACKTESTS}/${runId}`, hash: `#${TRACKING_ANCHOR}` }}
        className={styles.link}
      >
        Ver o acompanhamento
      </Link>
    </>
  );
}
