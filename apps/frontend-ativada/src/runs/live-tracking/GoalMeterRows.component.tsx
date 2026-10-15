// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatScaled, roundScaledDirected } from '../../format/decimal.js';
import { Icon } from '../../layout/Icon.component.js';
import { formatDirectedMoney } from '../directed-money.js';
import {
  formatDuration,
  formatRatePercent,
  formatScaledUsdt,
  type GoalMeters,
} from './goal-text.js';
import type { LiveGoal } from './live-status.validation.js';
import styles from './LiveTracking.module.css';

const CENTS = 2;
const MINUS = '−';

function money(value: bigint, direction: 'up' | 'down'): string {
  return formatScaled(roundScaledDirected(value, CENTS, direction));
}

function Meter(props: {
  readonly label: string;
  readonly value: string;
  readonly percent: number;
  readonly tone?: string | undefined;
  readonly note?: string;
}): ReactElement {
  return (
    <div className={styles.meter}>
      <div className={styles.meterRow}>
        <span>{props.label}</span>
        <strong className={styles.num}>{props.value}</strong>
      </div>
      <progress
        className={props.tone === undefined ? styles.bar : `${styles.bar} ${props.tone}`}
        aria-label={`${props.label}: ${props.percent}%`}
        value={props.percent}
        max={100}
      />
      {props.note === undefined ? null : (
        <span className={`${styles.extraSmall} ${styles.muted}`}>{props.note}</span>
      )}
    </div>
  );
}

export type GoalMeterRowsProps = {
  readonly goal: LiveGoal;
  readonly meters: GoalMeters;
};

export function GoalMeterRows({ goal, meters }: GoalMeterRowsProps): ReactElement {
  const lossPercent = formatRatePercent(goal.maxLossRate);
  const floor = formatDirectedMoney(goal.floorAmount, 'up');
  return (
    <div className={styles.meters}>
      <Meter
        label="Ganho até agora"
        value={`${money(meters.gain, 'down')} de ${money(meters.targetGain, 'up')} USDT · ${meters.gainPercent}%`}
        percent={meters.gainPercent}
      />
      <Meter
        label="Tempo usado"
        value={`${formatDuration(meters.elapsedMilliseconds)} de ${formatDuration(meters.totalMilliseconds)} · ${meters.timePercent}%`}
        percent={meters.timePercent}
        tone={styles.barTime}
      />
      <Meter
        label={`Perda máxima aceita (${MINUS}${lossPercent}% = ${floor})`}
        value={`${money(meters.loss, 'up')} de ${money(meters.maxLoss, 'up')} USDT`}
        percent={meters.lossPercent}
        tone={styles.barLoss}
        note={`Se o saldo cair a ${floor} USDT, a simulação para. Ainda cabem ${formatDirectedMoney(goal.lossRoomAmount, 'down')} USDT de queda.`}
      />
    </div>
  );
}

export function PaceVerdict({ meters }: { readonly meters: GoalMeters }): ReactElement {
  const expected = formatScaledUsdt(meters.expectedGain, 'up');
  return meters.isBehindPace ? (
    <div className={`${styles.verdict} ${styles.verdictWarn}`}>
      <Icon name="alert" />
      <span>
        <strong>Abaixo do ritmo</strong> quer dizer: já passou {meters.timePercent}% do prazo e o
        ganho ainda é {meters.gainPercent}% da meta. No ritmo linear (ganhar o mesmo tanto a cada
        dia até o prazo), hoje seria +{expected}.
      </span>
    </div>
  ) : (
    <div className={styles.verdict}>
      <Icon name="info" />
      <span>
        <strong>No caminho</strong> quer dizer: o ganho está no ritmo linear ou acima dele (hoje
        seria +{expected}).
      </span>
    </div>
  );
}
