// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import { useSessionService } from '../app/useAppContext.hook.js';
import { LiveStatusBadge } from '../live/LiveStatusBadge.component.js';
import { useLiveMarket } from '../live/useLiveMarket.hook.js';
import controls from '../styles/Controls.module.css';
import { ThemeToggle } from '../theme/ThemeToggle.component.js';
import styles from './AppShell.module.css';
import { MainNav } from './MainNav.component.js';

const PANEL_ID = 'main-menu-panel';

// Até 1100 px o menu fica recolhido atrás de um botão; a partir daí nav, tema e Sair cabem numa linha só.
export function HeaderMenu(): ReactElement {
  const session = useSessionService();
  const queryClient = useQueryClient();
  const liveStatus = useLiveMarket().streamStatus;
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  async function handleSignOut(): Promise<void> {
    await session.end();
    queryClient.clear();
  }

  return (
    <>
      <button
        type="button"
        className={`${controls.button} ${styles.menuButton}`}
        aria-expanded={isMenuOpen}
        aria-controls={PANEL_ID}
        onClick={() => setIsMenuOpen((current) => !current)}
      >
        Menu
      </button>
      <div
        id={PANEL_ID}
        className={isMenuOpen ? `${styles.panel} ${styles.panelOpen}` : styles.panel}
      >
        <MainNav onNavigate={() => setIsMenuOpen(false)} />
        <div className={styles.actions}>
          <LiveStatusBadge status={liveStatus} />
          <ThemeToggle />
          <button type="button" className={controls.button} onClick={() => void handleSignOut()}>
            Sair
          </button>
        </div>
      </div>
    </>
  );
}
