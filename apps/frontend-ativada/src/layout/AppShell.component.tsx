// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { Outlet } from 'react-router';

import { APP_NAME } from '../app/app.constant.js';
import { useSessionService } from '../app/useAppContext.hook.js';
import controls from '../styles/Controls.module.css';
import { LiveMarketProvider } from '../live/LiveMarketProvider.component.js';
import { LiveStatusBadge } from '../live/LiveStatusBadge.component.js';
import { useLiveMarket } from '../live/useLiveMarket.hook.js';
import { ThemeToggle } from '../theme/ThemeToggle.component.js';
import styles from './AppShell.module.css';
import { MainNav } from './MainNav.component.js';

function ShellFrame(): ReactElement {
  const session = useSessionService();
  const queryClient = useQueryClient();
  const liveStatus = useLiveMarket().streamStatus;

  async function handleSignOut(): Promise<void> {
    await session.end();
    queryClient.clear();
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>{APP_NAME}</span>
        <MainNav />
        <div className={styles.actions}>
          <LiveStatusBadge status={liveStatus} />
          <ThemeToggle />
          <button type="button" className={controls.button} onClick={() => void handleSignOut()}>
            Sair
          </button>
        </div>
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
