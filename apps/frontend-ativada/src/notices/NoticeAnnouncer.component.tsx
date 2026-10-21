// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './Notices.module.css';
import { useNoticeCenter } from './useNoticeCenter.hook.js';

// O ÚNICO aria-live dos avisos: anuncia só aviso novo e troca de estado da ordem, nunca tick, contagem nem "há N s".
export function NoticeAnnouncer(): ReactElement {
  const { announcement } = useNoticeCenter();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Anúncio dos avisos"
      className={styles['srOnly']}
    >
      <span key={announcement.id}>{announcement.text}</span>
    </div>
  );
}
