// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Outlet } from 'react-router';

import { APP_NAME } from '../app/app.constant.js';
import { NoticeAnnouncer } from '../notices/NoticeAnnouncer.component.js';
import { NoticeCenterProvider } from '../notices/NoticeCenterProvider.component.js';
import { NoticeDrawer } from '../notices/NoticeDrawer.component.js';
import { NoticeToastStack } from '../notices/NoticeToastStack.component.js';
import { useNoticeCenter } from '../notices/useNoticeCenter.hook.js';
import { LiveMarketProvider } from '../live/LiveMarketProvider.component.js';
import styles from './AppShell.module.css';
import { HeaderMenu } from './HeaderMenu.component.js';
import { useViewportDensity } from './useViewportDensity.hook.js';

function ShellFrame(): ReactElement {
  const { isDrawerOpen } = useNoticeCenter();
  useViewportDensity();
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>{APP_NAME}</span>
        <HeaderMenu />
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <NoticeAnnouncer />
      <NoticeToastStack />
      {isDrawerOpen ? <NoticeDrawer /> : null}
    </div>
  );
}

export function AppShell(): ReactElement {
  return (
    <LiveMarketProvider>
      <NoticeCenterProvider>
        <ShellFrame />
      </NoticeCenterProvider>
    </LiveMarketProvider>
  );
}
