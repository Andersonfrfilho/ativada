// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { StatusChip } from '../live-tracking/StatusChip.component.js';
import { SpeechBubble, Thought } from './SpeechBubble.component.js';
import { TeamFigure } from './TeamFigure.component.js';
import compact from './CompactTeam.module.css';
import styles from './TeamRoom.module.css';
import type { SeatState } from './team-room-sequence.js';
import { VOTE_LOOK } from './team-room-view.js';
import type { RuleLine, SpecialistView } from './team-room.types.js';

export type CompactSpecialistProps = {
  readonly specialist: SpecialistView;
  readonly state: SeatState;
  readonly isRinging: boolean;
};

function CompactRule({ rule }: { readonly rule: RuleLine }): ReactElement {
  const look = VOTE_LOOK[rule.voteKind];
  return (
    <li className={styles.rule}>
      <StatusChip tone={look.tone} icon={look.icon}>
        {rule.label}: {look.word}
      </StatusChip>
      {rule.motive === undefined ? null : <span className={compact.motive}>{rule.motive}</span>}
    </li>
  );
}

// Um especialista em tamanho compacto: o bonequinho ao lado e o balão com o voto de cada regra e a frase do servidor.
export function CompactSpecialist({
  specialist,
  state,
  isRinging,
}: CompactSpecialistProps): ReactElement {
  return (
    <div className={`${styles.seat} ${styles.front}`} data-state={state}>
      <div className={styles.avatar}>
        <TeamFigure
          role={specialist.family}
          tone={specialist.tone}
          state={state}
          isRinging={isRinging}
        />
      </div>
      <div className={styles.bubbleCell}>
        <Thought />
        <SpeechBubble tone={specialist.tone}>
          <strong className={styles.who}>{specialist.name}</strong>
          <ul className={styles.rules}>
            {specialist.rules.map((rule) => (
              <CompactRule key={rule.ruleId} rule={rule} />
            ))}
          </ul>
          {specialist.tone === 'quiet' ? (
            <span className={compact.motive}>{specialist.placard}</span>
          ) : null}
        </SpeechBubble>
      </div>
    </div>
  );
}
