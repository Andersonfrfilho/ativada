// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement } from 'react';

import { useCalm } from '../team-room/motion/useCalm.hook.js';
import { IntentChip } from './IntentChip.component.js';
import { OpinionCard } from './OpinionCard.component.js';
import { OUT_OF_SCORE, type RoomOpinion } from './room-opinions.js';
import { TRADING_ROOM_TEXT } from './trading-room.constant.js';
import styles from './TradingRoom.module.css';

// "Calmo" congela a cena onde está (a mesma preferência da Fase 2, lembrada neste navegador).
export function CalmToggle(): ReactElement {
  const { isCalm, setCalm } = useCalm();
  return (
    <button
      type="button"
      className={styles.calm}
      aria-pressed={isCalm}
      title={TRADING_ROOM_TEXT.CALM_NOTE}
      onClick={() => setCalm(!isCalm)}
    >
      {TRADING_ROOM_TEXT.CALM}
    </button>
  );
}

// A faixa compacta das mesas no celular: nome e intenção de cada um (o piso com os bonecos não aparece ali).
export function DeskStrip({
  opinions,
}: {
  readonly opinions: readonly RoomOpinion[];
}): ReactElement {
  return (
    <ul className={styles.strip} aria-label="A equipe nas mesas">
      {opinions.map((opinion) => (
        <li
          key={opinion.slot}
          className={styles.token}
          data-out={opinion.isOut ? 'true' : undefined}
        >
          <span className={styles.tokenName}>
            {opinion.name}
            {opinion.kind === 'model' ? ' ◆' : ''}
          </span>
          <IntentChip look={opinion.intent} />
          {opinion.isOut ? <span className={styles.tokenOut}>{OUT_OF_SCORE}</span> : null}
        </li>
      ))}
    </ul>
  );
}

// A alternativa em texto da cena: o que cada um acha, com os mesmos números dos balões.
export function OpinionList({
  opinions,
}: {
  readonly opinions: readonly RoomOpinion[];
}): ReactElement {
  const titleId = useId();
  return (
    <section className={styles.opinions} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.opinionsTitle}>
        {TRADING_ROOM_TEXT.OPINIONS_TITLE}
      </h3>
      <ul className={styles.cards}>
        {opinions.map((opinion) => (
          <li key={opinion.slot} className={styles.cardItem} data-tone={opinion.intent.tone}>
            <OpinionCard opinion={opinion} />
          </li>
        ))}
      </ul>
    </section>
  );
}
