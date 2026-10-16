// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement, ReactNode } from 'react';

import styles from './BesideTeam.module.css';
import { TeamAside, useHasTeamAside } from './TeamAside.context.js';

// A equipe não some quando o gráfico ainda não desenhou: a varanda fica acima do aviso que ocupa o lugar do gráfico.
export function BesideTeam({ children }: { readonly children: ReactNode }): ReactElement {
  if (!useHasTeamAside()) return <>{children}</>;
  return (
    <div className={styles.layout}>
      <TeamAside pointedOpenTime={undefined} />
      <div className={styles.main}>{children}</div>
    </div>
  );
}
