// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { Card } from '../../layout/Card.component.js';
import { useClock } from '../../live/useClock.hook.js';
import { formatDirectedMoney } from '../directed-money.js';
import { formatDirectedPercent } from './decision-text.js';
import {
  computeGoalMeters,
  describeRemaining,
  formatDayAndTime,
  formatRatePercent,
  horizonDaysOf,
  type GoalMeters,
  type RemainingContext,
} from './goal-text.js';
import type { LiveGoal, LiveStatus } from './live-status.validation.js';
import { GoalMeterRows, PaceVerdict } from './GoalMeterRows.component.js';
import styles from './LiveTracking.module.css';
import { CHIP_TONE, StatusChip, type ChipTone } from './StatusChip.component.js';

const CLOCK_MILLISECONDS = 60_000;

export const GOAL_OUTCOME_TEXT: Readonly<Record<NonNullable<LiveGoal['outcome']>, string>> = {
  goal_reached: 'Meta alcançada',
  goal_stopped: 'A simulação parou na perda máxima aceita',
  goal_expired: 'O prazo da meta acabou',
};

const OUTCOME_CHIP: Readonly<Record<NonNullable<LiveGoal['outcome']>, ChipTone>> = {
  goal_reached: CHIP_TONE.BUY,
  goal_stopped: CHIP_TONE.SELL,
  goal_expired: CHIP_TONE.WARN,
};

function goalChip(goal: LiveGoal, meters: GoalMeters | undefined): ReactElement | null {
  if (goal.outcome !== null) {
    return (
      <StatusChip
        tone={OUTCOME_CHIP[goal.outcome]}
        icon={goal.outcome === 'goal_reached' ? 'check' : 'alert'}
      >
        {GOAL_OUTCOME_TEXT[goal.outcome]}
      </StatusChip>
    );
  }
  if (meters === undefined) return null;
  return meters.isBehindPace ? (
    <StatusChip tone={CHIP_TONE.WARN} icon="alert">
      Abaixo do ritmo
    </StatusChip>
  ) : (
    <StatusChip tone={CHIP_TONE.INFO} icon="activity">
      No caminho
    </StatusChip>
  );
}

export type LiveGoalBlockProps = {
  readonly status: LiveStatus;
  readonly goalId?: string | null | undefined;
};

function OutcomeBody({
  goal,
  timeZone,
}: {
  readonly goal: LiveGoal;
  readonly timeZone: string;
}): ReactElement | null {
  if (goal.outcome === null) return null;
  const when = goal.outcomeAt === null ? '' : ` em ${formatDayAndTime(goal.outcomeAt, timeZone)}`;
  return (
    <p role="status" className={styles.bigValue}>
      {GOAL_OUTCOME_TEXT[goal.outcome]}
      {when}
    </p>
  );
}

type OpenBodyProps = {
  readonly goal: LiveGoal;
  readonly meters: GoalMeters | undefined;
  readonly context: RemainingContext;
};

function OpenBody({ goal, meters, context }: OpenBodyProps): ReactElement {
  const { timeZone } = context;
  return (
    <>
      <p className={`${styles.small} ${styles.muted}`}>Para bater a meta faltam</p>
      <p className={styles.bigValue}>
        {formatDirectedMoney(goal.remainingAmount, 'up')} USDT{' '}
        <span className={`${styles.small} ${styles.muted}`}>
          ({formatDirectedPercent(goal.remainingRate, 'up').replace('+', '')})
        </span>
      </p>
      <p className={styles.small}>
        Chegar a{' '}
        <strong className={styles.num}>{formatDirectedMoney(goal.targetAmount, 'up')}</strong> USDT
        até <strong>{formatDayAndTime(goal.deadlineAt, timeZone)}</strong> ·{' '}
        {describeRemaining(goal.deadlineAt, context)}.
      </p>
      {meters === undefined ? null : <GoalMeterRows goal={goal} meters={meters} />}
      {meters === undefined ? null : <PaceVerdict meters={meters} />}
    </>
  );
}

// A meta da simulação (RF04) com os números do servidor; sem meta o bloco não aparece; com desfecho gravado, só o desfecho.
export function LiveGoalBlock({ status, goalId }: LiveGoalBlockProps): ReactElement | null {
  const timeZone = useUserTimeZone();
  const now = useClock(CLOCK_MILLISECONDS);
  const goal = status.goal;
  if (goal === null) return null;
  const meters = computeGoalMeters({
    goal,
    balance: status.balance,
    periodStart: status.run.periodStart,
    now,
  });
  const horizonDays = horizonDaysOf(goal, status.run.periodStart);
  const title = `Meta: +${formatRatePercent(goal.targetRate)}% em ${horizonDays} ${horizonDays === 1 ? 'dia' : 'dias'}`;
  return (
    <Card title={title} icon="goals" aside={goalChip(goal, meters)}>
      {goal.outcome === null ? (
        <OpenBody goal={goal} meters={meters} context={{ now, timeZone }} />
      ) : (
        <OutcomeBody goal={goal} timeZone={timeZone} />
      )}
      {goalId === undefined || goalId === null ? null : (
        <div className={styles.cardFoot}>
          <span className={styles.muted}>Desfecho só no fim do prazo ou no limite de perda.</span>
          <Link to={`/metas/${goalId}`} className={styles.link}>
            Ver a meta e o ranking
          </Link>
        </div>
      )}
    </Card>
  );
}
