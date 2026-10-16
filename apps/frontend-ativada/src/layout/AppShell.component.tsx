// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Outlet } from 'react-router';

import { APP_NAME } from '../app/app.constant.js';
import { LiveMarketProvider } from '../live/LiveMarketProvider.component.js';
import styles from './AppShell.module.css';
import { HeaderMenu } from './HeaderMenu.component.js';

function ShellFrame(): ReactElement {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>{APP_NAME}</span>
        <HeaderMenu />
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

export function AppShell(): ReactElement {
  return (
    <LiveMarketProvider>
      <ShellFrame />
    </LiveMarketProvider>
  );
}
