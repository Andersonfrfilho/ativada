// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { NavLink } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import styles from './AppShell.module.css';

function navClassName({ isActive }: { readonly isActive: boolean }): string | undefined {
  return isActive ? `${styles.link} ${styles.active}` : styles.link;
}

const LINKS: readonly { readonly to: string; readonly label: string; readonly isExact: boolean }[] =
  [
    { to: ROUTE_PATH.OVERVIEW, label: 'Visão geral', isExact: true },
    { to: ROUTE_PATH.GOALS, label: 'Metas', isExact: false },
    { to: ROUTE_PATH.BACKTESTS, label: 'Backtests', isExact: false },
    { to: ROUTE_PATH.STRATEGIES, label: 'Estratégias', isExact: false },
    { to: ROUTE_PATH.ALERTS, label: 'Alertas', isExact: false },
    { to: ROUTE_PATH.ACCOUNT, label: 'Conta', isExact: false },
  ];

export function MainNav(): ReactElement {
  return (
    <nav aria-label="Principal" className={styles.nav}>
      {LINKS.map((link) => (
        <NavLink key={link.to} to={link.to} end={link.isExact} className={navClassName}>
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}
