// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement, ReactNode } from 'react';

import styles from './TeamRoom.module.css';
import type { SeatTone } from './team-room.types.js';

export type BubbleTone = SeatTone | 'plain';

const TONE_CLASS: Readonly<Record<BubbleTone, string | undefined>> = {
  voter: styles.bubbleVoter,
  normal: undefined,
  quiet: styles.bubbleQuiet,
  plain: undefined,
};

// Balão de fala: borda de destaque para quem votou, tracejado e apagado para quem está fora do placar.
export function SpeechBubble({
  tone,
  children,
}: {
  readonly tone: BubbleTone;
  readonly children: ReactNode;
}): ReactElement {
  return <div className={`${styles.bubble} ${TONE_CLASS[tone] ?? ''}`}>{children}</div>;
}

// Os três pontinhos de quem está "pensando" (só enquanto a vela nova é anunciada).
export function Thought(): ReactElement {
  return (
    <span className={styles.thought} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
