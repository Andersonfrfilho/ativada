// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement } from 'react';

import { Icon } from '../layout/Icon.component.js';
import controls from '../styles/Controls.module.css';
import { ConnectionStrip } from './ConnectionStrip.component.js';
import { NoticeEmpty } from './NoticeEmpty.component.js';
import { NoticeItem } from './NoticeItem.component.js';
import { NoticePreferencesPanel } from './NoticePreferences.component.js';
import { NoticeRunChips } from './NoticeRunChips.component.js';
import styles from './Notices.module.css';
import { SIMULATION_FIXED_TEXT } from './notice.constant.js';
import { groupByDay, listRunOptions } from './notice-groups.js';
import { useDrawerFocus } from './useDrawerFocus.hook.js';
import { useNoticeCenter } from './useNoticeCenter.hook.js';

type HeaderProps = {
  readonly titleRef: ReturnType<typeof useDrawerFocus>['titleRef'];
  readonly isAdjusting: boolean;
  readonly onToggleAdjust: () => void;
  readonly runFilter: string | undefined;
  readonly onFilter: (runId: string | undefined) => void;
};

function DrawerTools(props: {
  readonly isAdjusting: boolean;
  readonly onToggleAdjust: () => void;
}): ReactElement {
  const { markAllRead } = useNoticeCenter();
  return (
    <div className={styles['tools']}>
      <button type="button" className={styles['textButton']} onClick={markAllRead}>
        Marcar todos como lidos
      </button>
      <button
        type="button"
        className={styles['textButton']}
        aria-expanded={props.isAdjusting}
        onClick={props.onToggleAdjust}
      >
        Ajustar
      </button>
    </div>
  );
}

function DrawerHeader(props: HeaderProps): ReactElement {
  const center = useNoticeCenter();
  const unread = center.unreadCount > 0 ? `${center.unreadCount} não lidos` : 'tudo lido';
  return (
    <header className={styles['drawerHead']}>
      <div className={styles['drawerTitle']}>
        <h2 id="notice-drawer-title" ref={props.titleRef} tabIndex={-1}>
          Avisos
        </h2>
        <span className={styles['drawerCount']}>{unread}</span>
        <button
          type="button"
          className={styles['close']}
          aria-label="Fechar avisos"
          onClick={center.closeDrawer}
        >
          <Icon name="close" />
        </button>
      </div>
      <p className={styles['drawerSub']}>{SIMULATION_FIXED_TEXT}</p>
      <DrawerTools isAdjusting={props.isAdjusting} onToggleAdjust={props.onToggleAdjust} />
      <NoticeRunChips
        options={listRunOptions(center.items)}
        selected={props.runFilter}
        onSelect={props.onFilter}
      />
    </header>
  );
}

function DrawerList({ runFilter }: { readonly runFilter: string | undefined }): ReactElement {
  const center = useNoticeCenter();
  const shown = center.items.filter(
    (notice) => runFilter === undefined || notice.runId === runFilter,
  );
  const groups = groupByDay({ notices: shown, now: center.now, timeZone: center.timeZone });
  return (
    <>
      {groups.length === 0 && !center.isLoading ? <NoticeEmpty /> : null}
      {groups.map((group) => (
        <section key={group.day} aria-label={group.day}>
          <h3 className={styles['day']}>{group.day}</h3>
          <ul className={styles['list']}>
            {group.notices.map((notice) => (
              <NoticeItem key={notice.noticeId} notice={notice} />
            ))}
          </ul>
        </section>
      ))}
      {center.hasOlder ? (
        <button
          type="button"
          className={`${controls.button} ${styles['olderButton']}`}
          disabled={center.isLoadingOlder}
          onClick={center.loadOlder}
        >
          Ver avisos anteriores
        </button>
      ) : null}
    </>
  );
}

// RF09: a gaveta de avisos (diálogo modal): foco no título, preso dentro, Esc fecha e devolve o foco ao sino.
export function NoticeDrawer(): ReactElement {
  const { closeDrawer } = useNoticeCenter();
  const { titleRef, containerRef, handleKeyDown } = useDrawerFocus(closeDrawer);
  const [runFilter, setRunFilter] = useState<string | undefined>(undefined);
  const [isAdjusting, setIsAdjusting] = useState(false);
  return (
    <>
      <div className={styles['scrim']} onClick={closeDrawer} aria-hidden="true" />
      <div
        ref={containerRef}
        className={styles['drawer']}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notice-drawer-title"
        onKeyDown={handleKeyDown}
      >
        <DrawerHeader
          titleRef={titleRef}
          isAdjusting={isAdjusting}
          onToggleAdjust={() => setIsAdjusting((current) => !current)}
          runFilter={runFilter}
          onFilter={setRunFilter}
        />
        <ConnectionStrip />
        <div className={styles['body']}>
          {isAdjusting ? <NoticePreferencesPanel /> : null}
          <DrawerList runFilter={runFilter} />
        </div>
      </div>
    </>
  );
}
