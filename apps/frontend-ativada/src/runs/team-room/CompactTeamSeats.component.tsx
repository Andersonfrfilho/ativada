// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { AnalystSeat } from './AnalystSeat.component.js';
import { AuditorSeat } from './AuditorSeat.component.js';
import { CompactSpecialist } from './CompactSpecialist.component.js';
import styles from './CompactTeam.module.css';
import room from './TeamRoom.module.css';
import { analystStateOf, REST_STEP, seatStateOf } from './team-room-sequence.js';
import type { AuditorView, TeamRoomView } from './team-room.types.js';

export type CompactTeamSeatsProps = {
  readonly view: TeamRoomView | undefined;
  readonly auditor: AuditorView | undefined;
  readonly step: number;
  // Em largura total (equipe acima do gráfico): os assentos em grade, não empilhados.
  readonly isWide?: boolean;
};

// Os especialistas, o resumo do placar (ou o analista) e o auditor da equipe compacta, ao vivo ou revistos.
export function CompactTeamSeats({
  view,
  auditor,
  step,
  isWide = false,
}: CompactTeamSeatsProps): ReactElement | null {
  if (view === undefined) return null;
  const count = view.specialists.length;
  const isRinging = step !== REST_STEP && step >= count;
  return (
    <div
      className={`${room.stage} ${styles.seats} ${isWide ? (styles.wide ?? '') : ''}`}
      data-motion={step === REST_STEP ? 'off' : 'on'}
    >
      {view.specialists.map((specialist, index) => (
        <CompactSpecialist
          key={specialist.family}
          specialist={specialist}
          state={seatStateOf(index, step)}
          isRinging={isRinging}
        />
      ))}
      <AnalystSeat view={view} state={analystStateOf(count, step)} />
      <AuditorSeat auditor={auditor} isCompact />
    </div>
  );
}
