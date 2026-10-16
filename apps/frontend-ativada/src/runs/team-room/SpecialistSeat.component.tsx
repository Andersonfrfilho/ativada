// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import type { IconName } from '../../layout/Icon.component.js';
import { CHIP_TONE, StatusChip } from '../live-tracking/StatusChip.component.js';
import { SpeechBubble, Thought } from './SpeechBubble.component.js';
import { TeamFigure } from './TeamFigure.component.js';
import styles from './TeamRoom.module.css';
import type { SeatState } from './team-room-sequence.js';
import { VOTE_LOOK } from './team-room-view.js';
import type { RuleLine, SeatTone, SpecialistView } from './team-room.types.js';

export type SpecialistSeatProps = {
  readonly specialist: SpecialistView;
  readonly state: SeatState;
  readonly isRinging: boolean;
};

export function RuleItem({ rule }: { readonly rule: RuleLine }): ReactElement {
  const look = VOTE_LOOK[rule.voteKind];
  return (
    <li className={styles.rule}>
      <span className={styles.ruleHead}>
        <span className={styles.ruleName}>{rule.label}</span>
        <StatusChip tone={look.tone} icon={look.icon}>
          {look.word}
        </StatusChip>
      </span>
      {rule.motive === undefined ? null : <span className={styles.motive}>{rule.motive}</span>}
      {rule.reading === undefined ? null : (
        <span className={styles.reading}>leitura {rule.reading}</span>
      )}
    </li>
  );
}

type PlacardLook = { readonly icon: IconName; readonly word: string };

const PLACARD_LOOK: Readonly<Record<SeatTone, PlacardLook>> = {
  voter: { icon: 'check', word: 'votou' },
  normal: { icon: 'equal', word: 'sem voto' },
  quiet: { icon: 'pause', word: '' },
};

// A plaquinha: situação no placar (ícone + palavra + cor) e o peso que o servidor deu às regras.
export function Placard({ specialist }: { readonly specialist: SpecialistView }): ReactElement {
  const look = PLACARD_LOOK[specialist.tone];
  const text =
    specialist.tone === 'quiet' ? specialist.placard : `${look.word} · ${specialist.placard}`;
  return (
    <span className={styles.placard}>
      <StatusChip
        tone={specialist.tone === 'voter' ? CHIP_TONE.INFO : CHIP_TONE.NEUTRAL}
        icon={look.icon}
      >
        {text}
      </StatusChip>
    </span>
  );
}

// Um especialista: balão com as regras da família, bonequinho e plaquinha (a ordem muda com o tamanho da sala).
export function SpecialistSeat({
  specialist,
  state,
  isRinging,
}: SpecialistSeatProps): ReactElement {
  return (
    <div className={styles.seat} data-state={state}>
      <div className={styles.bubbleCell}>
        <Thought />
        <SpeechBubble tone={specialist.tone}>
          <strong className={styles.who}>{specialist.name}</strong>
          <ul className={styles.rules}>
            {specialist.rules.map((rule) => (
              <RuleItem key={rule.ruleId} rule={rule} />
            ))}
          </ul>
        </SpeechBubble>
      </div>
      <div className={styles.avatar}>
        <TeamFigure
          role={specialist.family}
          tone={specialist.tone}
          state={state}
          isRinging={isRinging}
        />
        <span className={styles.name}>{specialist.name}</span>
      </div>
      <div className={styles.placardCell}>
        <Placard specialist={specialist} />
      </div>
    </div>
  );
}
