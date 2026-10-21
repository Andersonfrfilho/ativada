// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon } from '../layout/Icon.component.js';
import styles from './Notices.module.css';
import { CONNECTION_NOTICE } from './notice-center.types.js';
import { useNoticeCenter } from './useNoticeCenter.hook.js';

// RF19: faixa discreta quando os avisos pararam de chegar; ícone + palavra + cor, sem toast por isso.
export function ConnectionStrip(): ReactElement | null {
  const { connection } = useNoticeCenter();
  if (connection === CONNECTION_NOTICE.OK) return null;
  const text =
    connection === CONNECTION_NOTICE.PAUSED
      ? 'Avisos pausados — reconectando…'
      : 'Avisos parados. Entre de novo.';
  return (
    <p className={styles['strip']} role="status">
      <Icon name="pause" size={16} />
      {text}
    </p>
  );
}
