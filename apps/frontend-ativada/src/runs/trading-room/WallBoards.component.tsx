// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { formatTimeInZone } from '../../format/zoned-time.js';
import { formatPrice } from '../../format/format.js';
import type { LiveStatus } from '../live-tracking/live-status.validation.js';
import { Icon } from '../../layout/Icon.component.js';
import type { SeatLook } from '../team-room/team-room.types.js';
import { strategyPlanRows } from './room-plan-rows.js';
import { describeScore } from './room-score.js';
import { TRADING_ROOM_TEXT } from './trading-room.constant.js';
import type { TradePlan } from './trade-plan.validation.js';
import { scorePips } from './wall-model.js';
import styles from './Wall.module.css';

function ScorePips({
  score,
  threshold,
}: {
  readonly score: string;
  readonly threshold: string;
}): ReactElement {
  return (
    <div className={styles.pips} aria-hidden="true">
      {scorePips(score, threshold).map((pip) => (
        <span
          key={pip.value}
          className={styles.pip}
          data-side={pip.side}
          data-on={pip.isOn}
          data-gate={pip.isGate}
        />
      ))}
    </div>
  );
}

export type DecisionBoardProps = {
  readonly status: LiveStatus;
  readonly tradePlan: TradePlan | undefined;
  readonly intent: SeatLook | undefined;
};

function StatusBadge({ look }: { readonly look: SeatLook }): ReactElement {
  return (
    <span className={styles.status} data-tone={look.tone}>
      <Icon name={look.icon} size={14} />
      <span>{look.word}</span>
    </span>
  );
}

// O quadro único "Decisão da equipe": estado, próxima vela, placar contra o limiar e o plano do servidor em linhas
// (compra, alvo, lucro previsto, proteção, resultado agora) com o último fechamento. Nenhum número aparece em outro lugar da parede.
export function DecisionBoard({ status, tradePlan, intent }: DecisionBoardProps): ReactElement {
  const timeZone = useUserTimeZone();
  const { nextDecisionAt } = status.run;
  const { triggers } = status;
  const plan = tradePlan?.plan;
  return (
    <section className={styles.board} aria-label={TRADING_ROOM_TEXT.DECISION_NOW}>
      <h4 className={styles.boardTitle}>{TRADING_ROOM_TEXT.DECISION_NOW}</h4>
      {intent === undefined ? null : <StatusBadge look={intent} />}
      <p className={styles.clock}>
        <small>próxima vela</small>{' '}
        {nextDecisionAt === null ? '--:--' : formatTimeInZone(nextDecisionAt, timeZone)}
      </p>
      {triggers.status === 'available' ? (
        <>
          <p className={styles.score}>{describeScore(triggers)}</p>
          <ScorePips score={triggers.score} threshold={triggers.scoreThreshold} />
        </>
      ) : null}
      <ul className={styles.priceRows}>
        {strategyPlanRows(plan).map((row) => (
          <li key={row.label} className={styles.priceRow} data-tone={row.tone}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
            {row.detail === undefined ? null : <em>{row.detail}</em>}
          </li>
        ))}
        {plan === undefined || plan.status === 'unavailable' ? null : (
          <li className={styles.priceRow} data-tone="neutral">
            <span>Último fechamento</span>
            <strong>{formatPrice(plan.currentPrice)}</strong>
          </li>
        )}
      </ul>
      <p className={styles.boardNote}>{plan === undefined ? triggers.message : plan.message}</p>
    </section>
  );
}
