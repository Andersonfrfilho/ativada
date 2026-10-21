// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { useUserTimeZone } from '../account/useUserTimeZone.hook.js';
import { ROUTE_PATH } from '../app/app.constant.js';
import { formatPrice } from '../format/format.js';
import { Card } from '../layout/Card.component.js';
import { useClock } from '../live/useClock.hook.js';
import {
  formatClosingMoment,
  formatScoreOfThreshold,
} from '../runs/live-tracking/decision-text.js';
import { ClosingMoment, OUTCOME_LOOK } from '../runs/live-tracking/DecisionRow.component.js';
import { useLiveStatusQuery } from '../runs/live-tracking/live-status.query.js';
import type { Decision } from '../runs/live-tracking/live-status.validation.js';
import { DECISIONS_ANCHOR } from '../runs/live-tracking/LiveTradesState.component.js';
import liveStyles from '../runs/live-tracking/LiveTracking.module.css';
import { StatusChip } from '../runs/live-tracking/StatusChip.component.js';
import controls from '../styles/Controls.module.css';
import styles from './Overview.module.css';

const CLOCK_MILLISECONDS = 60_000;
const SHOWN_DECISIONS = 5;

function countOutcomes(items: readonly Decision[]): string {
  const waited = items.filter((item) => item.outcome === 'waited').length;
  const bought = items.filter((item) => item.outcome === 'bought').length;
  const sold = items.filter((item) => item.outcome === 'sold' || item.outcome === 'exited').length;
  return `Nas últimas ${items.length} velas: ${waited} vezes esperou, ${bought} compras, ${sold} vendas.`;
}

type DecisionItemProps = {
  readonly decision: Decision;
  readonly now: number;
  readonly timeZone: string;
};

function DecisionItem({ decision, now, timeZone }: DecisionItemProps): ReactElement {
  const look = OUTCOME_LOOK[decision.outcome];
  return (
    <li className={styles.decision}>
      <span className={styles.decisionTime}>
        <ClosingMoment text={formatClosingMoment(decision.closedAt, { now, timeZone })} />
      </span>
      <span className={styles.decisionHead}>
        <StatusChip tone={look.tone} icon={look.icon}>
          {look.word}
        </StatusChip>
        <span className={styles.decisionPrice}>preço {formatPrice(decision.close)}</span>
        <span className={styles.decisionScore}>
          {formatScoreOfThreshold(decision.score, decision.scoreThreshold)}
        </span>
      </span>
      <span className={styles.decisionWhy}>{decision.message}</span>
    </li>
  );
}

// "Últimas decisões" (redesenho aprovado): inclui as vezes em que esperou, que são o sinal de vida da simulação.
export function LatestDecisionsCard({ runId }: { readonly runId: string }): ReactElement | null {
  const timeZone = useUserTimeZone();
  const now = useClock(CLOCK_MILLISECONDS);
  const items = useLiveStatusQuery(runId, true).data?.decisions.items;
  if (items === undefined) return null;
  return (
    <Card
      title="Últimas decisões"
      icon="list"
      aside={<span className={controls.muted}>pontuação / precisa para comprar</span>}
    >
      {items.length === 0 ? (
        <p className={controls.muted}>A primeira decisão aparece quando a primeira vela fechar.</p>
      ) : (
        <ul className={styles.decisions} aria-label="Últimas decisões">
          {items.slice(0, SHOWN_DECISIONS).map((decision) => (
            <DecisionItem
              key={decision.candleTime}
              decision={decision}
              now={now}
              timeZone={timeZone}
            />
          ))}
        </ul>
      )}
      <div className={liveStyles.cardFoot}>
        <span className={controls.muted}>{items.length === 0 ? '' : countOutcomes(items)}</span>
        <Link
          to={{ pathname: `${ROUTE_PATH.BACKTESTS}/${runId}`, hash: `#${DECISIONS_ANCHOR}` }}
          className={liveStyles.link}
        >
          Ver todas e o que falta para comprar
        </Link>
      </div>
    </Card>
  );
}
