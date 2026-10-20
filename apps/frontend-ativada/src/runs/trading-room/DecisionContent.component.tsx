// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { IntentChip } from './IntentChip.component.js';
import type { RoomOpinion } from './room-opinions.js';
import { TRADING_ROOM_TEXT } from './trading-room.constant.js';
import styles from './Opinion.module.css';

export type DecisionContentProps = {
  readonly leader: RoomOpinion;
  readonly label: string;
};

// A decisão da equipe (a ficha da Alice) em números grandes: a barra fixa embaixo da cena e a faixa da reunião.
export function DecisionContent({ leader, label }: DecisionContentProps): ReactElement {
  return (
    <div className={styles.decision}>
      <div className={styles.decisionHead}>
        <span className={styles.decisionLabel}>{label}</span>
        <IntentChip look={leader.intent} />
        {leader.line === undefined ? null : <span className={styles.line}>{leader.line}</span>}
      </div>
      <ul className={styles.bigNumbers}>
        {leader.rows.map((row) => (
          <li key={row.label} className={styles.bigNumber} data-tone={row.tone}>
            <small>{row.label}</small>
            <strong>{row.value}</strong>
            {row.detail === undefined ? null : <em>{row.detail}</em>}
          </li>
        ))}
      </ul>
      {leader.note === undefined ? null : <p className={styles.note}>{leader.note}</p>}
      <p className={styles.decisionFoot}>{TRADING_ROOM_TEXT.DECISION_FOOT}</p>
    </div>
  );
}
