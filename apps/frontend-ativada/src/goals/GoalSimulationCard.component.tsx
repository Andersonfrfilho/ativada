// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { useUserTimeZone } from '../account/useUserTimeZone.hook.js';
import { ROUTE_PATH } from '../app/app.constant.js';
import { Card } from '../layout/Card.component.js';
import { useClock } from '../live/useClock.hook.js';
import { formatDirectedMoney } from '../runs/directed-money.js';
import { formatDirectedPercent } from '../runs/live-tracking/decision-text.js';
import {
  computeGoalMeters,
  formatDayAndTime,
  formatDuration,
} from '../runs/live-tracking/goal-text.js';
import { GoalMeterRows, PaceVerdict } from '../runs/live-tracking/GoalMeterRows.component.js';
import { useLiveStatusQuery } from '../runs/live-tracking/live-status.query.js';
import type { LiveGoal, LiveStatus } from '../runs/live-tracking/live-status.validation.js';
import { TRACKING_ANCHOR } from '../runs/live-tracking/LiveTrackingCard.component.js';
import styles from '../runs/live-tracking/LiveTracking.module.css';
import { useActiveLiveRunsQuery } from './live-runs.query.js';

const CLOCK_MILLISECONDS = 60_000;

type TileProps = {
  readonly label: string;
  readonly value: string;
  readonly note: string;
  readonly extra?: string;
};

function Tile({ label, value, note, extra }: TileProps): ReactElement {
  return (
    <div className={styles.kpi}>
      <p className={styles.kpiLabel}>{label}</p>
      <p className={styles.kpiValue}>
        {value}
        {extra === undefined ? null : <span className={styles.unit}>{extra}</span>}
      </p>
      <p className={styles.kpiNote}>{note}</p>
    </div>
  );
}

function GoalTiles({ goal, now }: { readonly goal: LiveGoal; readonly now: number }): ReactElement {
  const timeZone = useUserTimeZone();
  return (
    <div className={styles.kpis}>
      <Tile
        label="Faltam"
        value={formatDirectedMoney(goal.remainingAmount, 'up')}
        extra={`USDT (${formatDirectedPercent(goal.remainingRate, 'up').replace('+', '')})`}
        note={`para ${formatDirectedMoney(goal.targetAmount, 'up')} USDT`}
      />
      <Tile
        label="Prazo"
        value={formatDuration(Math.max(0, goal.deadlineAt - now))}
        note={`termina ${formatDayAndTime(goal.deadlineAt, timeZone)}`}
      />
      <Tile
        label="Queda que ainda cabe"
        value={formatDirectedMoney(goal.lossRoomAmount, 'down')}
        extra="USDT"
        note={`para no saldo de ${formatDirectedMoney(goal.floorAmount, 'up')}`}
      />
    </div>
  );
}

type SimulationBodyProps = { readonly status: LiveStatus; readonly runId: string };

function SimulationBody({ status, runId }: SimulationBodyProps): ReactElement | null {
  const now = useClock(CLOCK_MILLISECONDS);
  const { goal } = status;
  if (goal === null || goal.outcome !== null) return null;
  const meters = computeGoalMeters({
    goal,
    balance: status.balance,
    periodStart: status.run.periodStart,
    now,
  });
  return (
    <>
      <GoalTiles goal={goal} now={now} />
      {meters === undefined ? null : <GoalMeterRows goal={goal} meters={meters} />}
      {meters === undefined ? null : <PaceVerdict meters={meters} />}
      <div className={styles.cardFoot}>
        <span className={styles.muted}>Desfecho só no fim do prazo ou no limite de perda.</span>
        <Link
          to={{ pathname: `${ROUTE_PATH.BACKTESTS}/${runId}`, hash: `#${TRACKING_ANCHOR}` }}
          className={styles.link}
        >
          Abrir o acompanhamento
        </Link>
      </div>
    </>
  );
}

// "Simulação desta meta" (redesenho aprovado): só aparece quando há uma simulação ao vivo atrelada a ESTA meta.
export function GoalSimulationCard({ goalId }: { readonly goalId: string }): ReactElement | null {
  const run = useActiveLiveRunsQuery().data?.find((item) => item.goalId === goalId);
  const status = useLiveStatusQuery(run?.id ?? '', run !== undefined).data;
  if (run === undefined || status === undefined || status.goal === null) return null;
  if (status.goal.outcome !== null) return null;
  return (
    <Card title="Simulação desta meta" icon="activity">
      <SimulationBody status={status} runId={run.id} />
    </Card>
  );
}
