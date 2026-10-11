// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { NavLink, Outlet } from 'react-router';

import { APP_NAME, ROUTE_PATH } from '../app/app.constant.js';
import { useSessionService } from '../app/useAppContext.hook.js';
import controls from '../styles/Controls.module.css';
import { ThemeToggle } from '../theme/ThemeToggle.component.js';
import styles from './AppShell.module.css';

function navClassName({ isActive }: { readonly isActive: boolean }): string | undefined {
  return isActive ? `${styles.link} ${styles.active}` : styles.link;
}

export function AppShell(): ReactElement {
  const session = useSessionService();
  const queryClient = useQueryClient();

  async function handleSignOut(): Promise<void> {
    await session.end();
    queryClient.clear();
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>{APP_NAME}</span>
        <nav aria-label="Principal" className={styles.nav}>
          <NavLink to={ROUTE_PATH.OVERVIEW} end className={navClassName}>
            Visão geral
          </NavLink>
          <NavLink to={ROUTE_PATH.ACCOUNT} className={navClassName}>
            Conta
          </NavLink>
        </nav>
        <div className={styles.actions}>
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
