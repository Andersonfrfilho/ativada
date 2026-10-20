// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { IntentChip } from './IntentChip.component.js';
import type { OpinionRow } from './room-plan-rows.js';
import { OUT_OF_SCORE, type RoomOpinion } from './room-opinions.js';
import styles from './Opinion.module.css';

const MODEL_MARK = '◆';

function Rows({ rows }: { readonly rows: readonly OpinionRow[] }): ReactElement | null {
  if (rows.length === 0) return null;
  return (
    <ul className={styles.rows}>
      {rows.map((row) => (
        <li key={row.label} className={styles.row} data-tone={row.tone}>
          <span>{row.label}</span>
          <strong>{row.value}</strong>
          {row.detail === undefined ? null : <em>{row.detail}</em>}
        </li>
      ))}
    </ul>
  );
}

function Confidence({ value }: { readonly value: number | null }): ReactElement | null {
  if (value === null) return null;
  return (
    <p className={styles.confidence}>
      Confiança <meter min={0} max={100} value={value} aria-hidden="true" />{' '}
      <strong>{value}</strong> de 100
    </p>
  );
}

// O que alguém acha, em números do servidor: a mesma ficha no balão do telão, na faixa da reunião e na lista em texto.
export function OpinionCard({ opinion }: { readonly opinion: RoomOpinion }): ReactElement {
  return (
    <div className={styles.card} data-out={opinion.isOut ? 'true' : undefined}>
      <div className={styles.head}>
        <span className={styles.who}>
          <strong>
            {opinion.name}
            {opinion.kind === 'model' ? ` ${MODEL_MARK}` : ''}
          </strong>
          <small>{opinion.role}</small>
        </span>
        <IntentChip look={opinion.intent} />
      </div>
      {opinion.line === undefined ? null : <p className={styles.line}>{opinion.line}</p>}
      <Rows rows={opinion.rows} />
      {opinion.note === undefined ? null : <p className={styles.note}>{opinion.note}</p>}
      <Confidence value={opinion.confidence} />
      {opinion.isOut ? <p className={styles.out}>{OUT_OF_SCORE}</p> : null}
      {opinion.wallet === undefined ? null : <p className={styles.wallet}>{opinion.wallet}</p>}
    </div>
  );
}
