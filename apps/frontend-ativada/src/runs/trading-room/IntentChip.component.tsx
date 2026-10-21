// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon } from '../../layout/Icon.component.js';
import type { SeatLook } from '../team-room/team-room.types.js';
import styles from './Opinion.module.css';

// A intenção de alguém: sempre ícone + palavra + cor, nunca só um deles.
export function IntentChip({ look }: { readonly look: SeatLook }): ReactElement {
  return (
    <span className={styles.chip} data-tone={look.tone}>
      <Icon name={look.icon} size={14} />
      <span>{look.word}</span>
    </span>
  );
}
