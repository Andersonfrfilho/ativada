// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { useMatch } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import styles from './Notices.module.css';
import { TOAST_VISIBLE_MAXIMUM } from './notice.constant.js';
import { NoticeSummaryToast } from './NoticeSummaryToast.component.js';
import { NoticeToast } from './NoticeToast.component.js';
import { useNoticeCenter } from './useNoticeCenter.hook.js';

// A pilha de avisos: no máximo 3 visíveis (o mais novo em cima), o resto vira "+N no sino"; com o gráfico na tela fica compacta.
export function NoticeToastStack(): ReactElement | null {
  const { toasts, summary, openDrawer } = useNoticeCenter();
  const isCompact = useMatch(ROUTE_PATH.BACKTEST) !== null;
  if (toasts.length === 0 && summary === undefined) return null;
  const visible = toasts.slice(0, TOAST_VISIBLE_MAXIMUM);
  const hidden = toasts.length - visible.length;
  return (
    <ul className={styles['stack']} aria-label="Avisos recentes">
      {summary === undefined ? null : <NoticeSummaryToast text={summary} />}
      {visible.map((entry) => (
        <NoticeToast key={entry.notice.noticeId} entry={entry} isCompact={isCompact} />
      ))}
      {hidden > 0 ? (
        <li>
          <button type="button" className={styles['more']} onClick={openDrawer}>
            +{hidden} no sino
          </button>
        </li>
      ) : null}
    </ul>
  );
}
