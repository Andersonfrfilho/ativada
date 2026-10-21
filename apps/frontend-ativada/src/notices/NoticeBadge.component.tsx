// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon } from '../layout/Icon.component.js';
import styles from './Notices.module.css';
import type { NoticeTone } from './notice-tone.js';

// O estado do aviso: ícone + palavra + cor (nunca só cor).
export function NoticeBadge({ tone }: { readonly tone: NoticeTone }): ReactElement {
  return (
    <span className={styles['state']}>
      <Icon name={tone.icon} size={14} />
      {tone.word}
    </span>
  );
}
