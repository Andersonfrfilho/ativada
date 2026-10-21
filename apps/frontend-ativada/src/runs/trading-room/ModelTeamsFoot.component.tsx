// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { EnableTeamsLink } from '../model-teams/EnableTeamsLink.component.js';
import { useModelTeamsView } from '../model-teams/useModelTeamsView.hook.js';
import { BALCONY_TEXT } from '../team-room/balcony/balcony.constant.js';
import styles from './TradingRoom.module.css';

// O pé das equipes ◆: ligadas, a frase de que elas indicam e não votam; nenhuma ligada, só o link discreto para Conta.
export function ModelTeamsFoot(): ReactElement | null {
  const view = useModelTeamsView();
  if (view.status === 'idle' || view.status === 'loading') return null;
  if (view.status === 'absent')
    return <p className={styles.teamRunNote}>{BALCONY_TEXT.MODELS_ONLY_LIVE}</p>;
  if (view.status === 'error')
    return <p className={styles.teamRunNote}>{BALCONY_TEXT.MODELS_ERROR}</p>;
  if (view.teams.length === 0) return <EnableTeamsLink />;
  return <p className={styles.teamRunNote}>{BALCONY_TEXT.MODELS_NOTE}</p>;
}
