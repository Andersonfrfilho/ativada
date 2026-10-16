// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon } from '../layout/Icon.component.js';
import styles from './Notices.module.css';
import { CONNECTION_NOTICE } from './notice-center.types.js';
import { NoticeFirstRun } from './NoticeFirstRun.component.js';
import { useNoticeCenter } from './useNoticeCenter.hook.js';

const COUNT_CAP = 9;

function describeBell(unreadCount: number, isPaused: boolean): string {
  const unread =
    unreadCount === 0
      ? 'nenhum não lido'
      : `${unreadCount} ${unreadCount === 1 ? 'não lido' : 'não lidos'}`;
  return `Avisos: ${unread}${isPaused ? ' · pausados, reconectando' : ''}`;
}

// O sino do cabeçalho, sempre visível (fora do menu recolhido): contador de não lidos, ponto âmbar se os avisos pausaram.
export function NoticeBell(): ReactElement {
  const center = useNoticeCenter();
  const isPaused = center.connection === CONNECTION_NOTICE.PAUSED;
  return (
    <span className={styles['bellWrap']}>
      <button
        type="button"
        className={styles['bell']}
        aria-label={describeBell(center.unreadCount, isPaused)}
        aria-haspopup="dialog"
        aria-expanded={center.isDrawerOpen}
        onClick={center.isDrawerOpen ? center.closeDrawer : center.openDrawer}
      >
        <Icon name="alerts" size={22} />
        {center.unreadCount > 0 ? (
          <span className={styles['count']} aria-hidden="true">
            {center.unreadCount > COUNT_CAP ? `${COUNT_CAP}+` : center.unreadCount}
          </span>
        ) : null}
        {isPaused ? <span className={styles['paused']} aria-hidden="true" /> : null}
      </button>
      <NoticeFirstRun />
    </span>
  );
}
