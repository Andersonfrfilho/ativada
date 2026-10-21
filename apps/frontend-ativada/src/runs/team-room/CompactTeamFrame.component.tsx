// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement, type ReactNode } from 'react';

import { Icon } from '../../layout/Icon.component.js';
import styles from './CompactTeam.module.css';
import { TEAM_ROOM_TEXT } from './team-room.constant.js';

// A moldura "Equipe agora": sempre a mesma, com ou sem opinião para mostrar.
export function CompactTeamFrame({ children }: { readonly children: ReactNode }): ReactElement {
  const headingId = useId();
  return (
    <aside className={styles.compact} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.title}>
        <Icon name="team" size={16} />
        {TEAM_ROOM_TEXT.COMPACT_TITLE}
      </h3>
      {children}
    </aside>
  );
}
