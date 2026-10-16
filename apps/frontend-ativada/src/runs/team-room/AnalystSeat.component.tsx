// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { ANALYST_TEXT } from '../analyst/analyst.constant.js';
import { StatusChip } from '../live-tracking/StatusChip.component.js';
import { SpeechBubble, Thought } from './SpeechBubble.component.js';
import { TeamFigure } from './TeamFigure.component.js';
import styles from './TeamRoom.module.css';
import type { SeatState } from './team-room-sequence.js';
import { TEAM_ROOM_TEXT } from './team-room.constant.js';
import type { RiskAnalystView, TeamRoomView } from './team-room.types.js';

export type AnalystSeatProps = {
  readonly view: TeamRoomView;
  readonly state: SeatState;
};

// O resumo do placar da estratégia (simulação sem analista): pontuação contra o limiar e o que a estratégia fez.
export function StrategySummarySpeech({ view }: { readonly view: TeamRoomView }): ReactElement {
  const { analyst } = view;
  return (
    <>
      <strong className={styles.who}>{analyst.name}</strong>
      <span className={styles.analystLine}>
        <StatusChip tone={analyst.outcome.tone} icon={analyst.outcome.icon}>
          {analyst.outcome.word}
        </StatusChip>
        <span className={styles.number}>pontuação {analyst.scoreText}</span>
      </span>
      <span className={styles.motive}>{analyst.message}</span>
      {view.hasOpinion ? null : <span className={styles.note}>{TEAM_ROOM_TEXT.NO_OPINION}</span>}
    </>
  );
}

// O analista de risco de verdade: a postura (ícone + palavra + cor) e as frases do servidor, com o selo do modo sombra.
export function RiskAnalystSpeech({ risk }: { readonly risk: RiskAnalystView }): ReactElement {
  return (
    <>
      <strong className={styles.who}>{risk.name}</strong>
      <span className={styles.analystLine}>
        <StatusChip tone={risk.look.tone} icon={risk.look.icon}>
          {risk.look.word}
        </StatusChip>
      </span>
      {risk.lines.map((line) => (
        <span key={line} className={styles.motive}>
          {line}
        </span>
      ))}
      <span className={styles.note}>
        {risk.isShadow ? ANALYST_TEXT.SHADOW_SEAL : ANALYST_TEXT.GOVERN_SEAL}
      </span>
    </>
  );
}

// Quem fala por último: o analista de risco, quando a simulação tem um, ou o resumo do placar da estratégia.
export function AnalystSeat({ view, state }: AnalystSeatProps): ReactElement {
  const { riskAnalyst } = view;
  return (
    <div className={`${styles.seat} ${styles.front}`} data-state={state}>
      <div className={styles.avatar}>
        <TeamFigure role="analyst" tone="normal" state={state} isRinging={false} />
        <span className={styles.name}>
          {riskAnalyst === undefined ? 'Resumo' : ANALYST_TEXT.SEAT_NAME}
        </span>
      </div>
      <div className={styles.bubbleCell}>
        <Thought />
        <SpeechBubble tone="plain">
          {riskAnalyst === undefined ? (
            <StrategySummarySpeech view={view} />
          ) : (
            <RiskAnalystSpeech risk={riskAnalyst} />
          )}
        </SpeechBubble>
      </div>
    </div>
  );
}
