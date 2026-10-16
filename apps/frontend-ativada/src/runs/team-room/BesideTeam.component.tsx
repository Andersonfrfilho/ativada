// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement, ReactNode } from 'react';

import styles from './BesideTeam.module.css';
import { TeamAside, useHasTeamAside } from './TeamAside.context.js';

// A equipe não some quando o gráfico ainda não desenhou: o aviso do lugar do gráfico ganha a coluna da equipe ao lado.
export function BesideTeam({ children }: { readonly children: ReactNode }): ReactElement {
  if (!useHasTeamAside()) return <>{children}</>;
  return (
    <div className={styles.layout}>
      <div className={styles.main}>{children}</div>
      <div className={styles.side}>
        <TeamAside pointedOpenTime={undefined} />
      </div>
    </div>
  );
}
