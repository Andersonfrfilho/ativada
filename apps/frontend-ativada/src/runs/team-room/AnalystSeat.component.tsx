// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { StatusChip } from '../live-tracking/StatusChip.component.js';
import { SpeechBubble, Thought } from './SpeechBubble.component.js';
import { TeamFigure } from './TeamFigure.component.js';
import styles from './TeamRoom.module.css';
import type { SeatState } from './team-room-sequence.js';
import { TEAM_ROOM_TEXT } from './team-room.constant.js';
import type { TeamRoomView } from './team-room.types.js';

export type AnalystSeatProps = {
  readonly view: TeamRoomView;
  readonly state: SeatState;
};

// O resumo do placar da estratégia (versão 1, sem o analista de risco): pontuação contra o limiar e o que a estratégia fez.
export function AnalystSeat({ view, state }: AnalystSeatProps): ReactElement {
  const { analyst } = view;
  return (
    <div className={`${styles.seat} ${styles.front}`} data-state={state}>
      <div className={styles.avatar}>
        <TeamFigure role="analyst" tone="normal" state={state} isRinging={false} />
        <span className={styles.name}>Resumo</span>
      </div>
      <div className={styles.bubbleCell}>
        <Thought />
        <SpeechBubble tone="plain">
          <strong className={styles.who}>{analyst.name}</strong>
          <span className={styles.analystLine}>
            <StatusChip tone={analyst.outcome.tone} icon={analyst.outcome.icon}>
              {analyst.outcome.word}
            </StatusChip>
            <span className={styles.number}>pontuação {analyst.scoreText}</span>
          </span>
          <span className={styles.motive}>{analyst.message}</span>
          {view.hasOpinion ? null : (
            <span className={styles.note}>{TEAM_ROOM_TEXT.NO_OPINION}</span>
          )}
        </SpeechBubble>
      </div>
    </div>
  );
}
