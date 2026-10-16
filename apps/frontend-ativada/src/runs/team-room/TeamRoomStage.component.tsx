// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { AnalystSeat } from './AnalystSeat.component.js';
import { AuditorSeat } from './AuditorSeat.component.js';
import { SpecialistSeat } from './SpecialistSeat.component.js';
import styles from './TeamRoom.module.css';
import { analystStateOf, REST_STEP, seatStateOf } from './team-room-sequence.js';
import type { AuditorView, TeamRoomView } from './team-room.types.js';

export type TeamRoomStageProps = {
  readonly view: TeamRoomView;
  readonly auditor: AuditorView | undefined;
  readonly step: number;
  readonly isRinging: boolean;
};

// O palco é decorativo (`aria-hidden`, nada focável): as mesmas falas ficam na lista de texto abaixo. Sala larga: os
// especialistas ao fundo e o resumo com o auditor na frente; sala estreita: uma linha por personagem.
export function TeamRoomStage({
  view,
  auditor,
  step,
  isRinging,
}: TeamRoomStageProps): ReactElement {
  const count = view.specialists.length;
  return (
    <div className={styles.stageBox}>
      <div
        className={styles.stage}
        aria-hidden="true"
        data-motion={step === REST_STEP ? 'off' : 'on'}
      >
        <div className={styles.back}>
          {view.specialists.map((specialist, index) => (
            <SpecialistSeat
              key={specialist.family}
              specialist={specialist}
              state={seatStateOf(index, step)}
              isRinging={isRinging}
            />
          ))}
        </div>
        <div className={styles.frontRow}>
          <AnalystSeat view={view} state={analystStateOf(count, step)} />
          <AuditorSeat auditor={auditor} />
        </div>
      </div>
    </div>
  );
}
