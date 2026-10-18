// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { ModelTeamsRunProvider } from '../../model-teams/ModelTeamsRun.context.js';
import { TEAM_RUN_NOTE } from '../../model-teams/run-source-label.js';
import styles from './Balcony.module.css';
import { ModelTeamChips } from './ModelTeamChips.component.js';

// A varanda de uma execução de equipe: sem os especialistas de regra (o placar não se aplica), só as equipes ◆ e a frase que explica.
export function TeamRunBalcony({ runId }: { readonly runId: string }): ReactElement {
  return (
    <div className={styles.balcony} data-motion="off">
      <ModelTeamsRunProvider runId={runId}>
        <ModelTeamChips />
      </ModelTeamsRunProvider>
      <p className={styles.modelsNote}>{TEAM_RUN_NOTE}</p>
    </div>
  );
}
