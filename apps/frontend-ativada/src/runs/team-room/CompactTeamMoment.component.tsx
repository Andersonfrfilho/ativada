// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon } from '../../layout/Icon.component.js';
import styles from './CompactTeam.module.css';

export type CompactTeamMomentProps = {
  readonly text: string;
  // A vela foi apontada no gráfico (bandeira + destaque); sem ela é a mais recente.
  readonly isPointed: boolean;
};

export function CompactTeamMoment({ text, isPointed }: CompactTeamMomentProps): ReactElement {
  return (
    <p className={isPointed ? `${styles.moment} ${styles.pointed}` : styles.moment}>
      {isPointed ? <Icon name="flag" size={14} /> : null}
      {text}
    </p>
  );
}
