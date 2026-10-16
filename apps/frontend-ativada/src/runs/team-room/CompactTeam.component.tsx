// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement } from 'react';

import { Icon } from '../../layout/Icon.component.js';
import { StatusChip } from '../live-tracking/StatusChip.component.js';
import { useLiveStatusQuery } from '../live-tracking/live-status.query.js';
import styles from './TeamRoomCard.module.css';
import { TEAM_ROOM_TEXT } from './team-room.constant.js';
import { buildTeamRoomView, VOTE_LOOK } from './team-room-view.js';
import type { SpecialistView, TeamRoomView } from './team-room.types.js';

function SpecialistLine({ specialist }: { readonly specialist: SpecialistView }): ReactElement {
  const quietClass = specialist.tone === 'quiet' ? styles.compactQuiet : undefined;
  return (
    <li className={`${styles.compactItem} ${quietClass ?? ''}`}>
      <span className={styles.compactName}>{specialist.name}</span>
      {specialist.rules.map((rule) => {
        const look = VOTE_LOOK[rule.voteKind];
        return (
          <StatusChip key={rule.ruleId} tone={look.tone} icon={look.icon}>
            {rule.label}: {look.word}
          </StatusChip>
        );
      })}
    </li>
  );
}

function CompactList({ view }: { readonly view: TeamRoomView }): ReactElement {
  const { analyst } = view;
  return (
    <ul className={styles.compactList}>
      {view.specialists.map((specialist) => (
        <SpecialistLine key={specialist.family} specialist={specialist} />
      ))}
      <li className={styles.compactItem}>
        <span className={styles.compactName}>Resumo</span>
        <StatusChip tone={analyst.outcome.tone} icon={analyst.outcome.icon}>
          {analyst.outcome.word}
        </StatusChip>
        <span>pontuação {analyst.scoreText}</span>
      </li>
    </ul>
  );
}

// A equipe em versão compacta, ao lado de "Próxima vela de perto": os votos da vela mais recente, sem bonequinhos.
export function CompactTeam({ runId }: { readonly runId: string }): ReactElement | null {
  const headingId = useId();
  const status = useLiveStatusQuery(runId, true).data;
  const decision = status?.decisions.items[0];
  if (status === undefined || decision === undefined) return null;
  const view = buildTeamRoomView({ decision, triggers: status.triggers });
  return (
    <aside className={styles.compact} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.compactTitle}>
        <Icon name="team" size={16} />
        {TEAM_ROOM_TEXT.COMPACT_TITLE}
      </h3>
      <CompactList view={view} />
    </aside>
  );
}
