// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { StatusChip } from '../live-tracking/StatusChip.component.js';
import { SpeechBubble } from './SpeechBubble.component.js';
import { TeamFigure } from './TeamFigure.component.js';
import styles from './TeamRoom.module.css';
import { TEAM_ROOM_TEXT } from './team-room.constant.js';
import type { AuditorView } from './team-room.types.js';

function AuditorSpeech({
  auditor,
  isCompact,
}: {
  readonly auditor: AuditorView;
  readonly isCompact: boolean;
}): ReactElement {
  return (
    <>
      <StatusChip tone={auditor.look.tone} icon={auditor.look.icon}>
        {auditor.look.word}
      </StatusChip>
      <span className={styles.motive}>
        Acertou o lado <span className={styles.number}>{auditor.rateText}</span>; a moeda ao ar
        acerta <span className={styles.number}>{auditor.coinText}</span>.
      </span>
      {isCompact ? null : <span className={styles.motive}>{auditor.verdictMessage}</span>}
      {isCompact || auditor.intervalText === undefined ? null : (
        <span className={styles.note}>{auditor.intervalText}</span>
      )}
    </>
  );
}

// O auditor confere o acerto da estratégia contra a moeda ao ar, com o resumo que o servidor já calculou (spec 009).
// `isCompact` (equipe junto do gráfico) corta o veredito e o intervalo, que seguem na sala grande.
export function AuditorSeat({
  auditor,
  isCompact = false,
}: {
  readonly auditor: AuditorView | undefined;
  readonly isCompact?: boolean;
}): ReactElement {
  return (
    <div className={`${styles.seat} ${styles.front}`} data-state="spoken">
      <div className={styles.avatar}>
        <TeamFigure role="auditor" tone="normal" state="spoken" isRinging={false} />
        <span className={styles.name}>{TEAM_ROOM_TEXT.AUDITOR_NAME}</span>
      </div>
      <div className={styles.bubbleCell}>
        <SpeechBubble tone="plain">
          <strong className={styles.who}>{TEAM_ROOM_TEXT.AUDITOR_NAME}</strong>
          {auditor === undefined ? (
            <span className={styles.motive}>Conferindo os acertos…</span>
          ) : (
            <AuditorSpeech auditor={auditor} isCompact={isCompact} />
          )}
        </SpeechBubble>
      </div>
    </div>
  );
}
