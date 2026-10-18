// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { NavLink } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import styles from './AppShell.module.css';
import { LiveNavCount } from '../wayfinding/LiveNavCount.component.js';
import { Icon, type IconName } from './Icon.component.js';

function navClassName({ isActive }: { readonly isActive: boolean }): string | undefined {
  return isActive ? `${styles.link} ${styles.active}` : styles.link;
}

type NavLinkItem = {
  readonly to: string;
  readonly label: string;
  readonly isExact: boolean;
  readonly icon: IconName;
};

const LINKS: readonly NavLinkItem[] = [
  { to: ROUTE_PATH.OVERVIEW, label: 'Visão geral', isExact: true, icon: 'overview' },
  { to: ROUTE_PATH.LIVE, label: 'Ao vivo', isExact: false, icon: 'activity' },
  { to: ROUTE_PATH.GOALS, label: 'Metas', isExact: false, icon: 'goals' },
  { to: ROUTE_PATH.HORIZONS, label: 'Prazos', isExact: false, icon: 'horizons' },
  { to: ROUTE_PATH.ASSETS, label: 'Ativos', isExact: false, icon: 'assets' },
  { to: ROUTE_PATH.BACKTESTS, label: 'Backtests', isExact: false, icon: 'backtests' },
  { to: ROUTE_PATH.STRATEGIES, label: 'Estratégias', isExact: false, icon: 'strategies' },
  { to: ROUTE_PATH.ALERTS, label: 'Alertas', isExact: false, icon: 'alerts' },
  { to: ROUTE_PATH.ACCOUNT, label: 'Conta', isExact: false, icon: 'account' },
];

export type MainNavProps = { readonly onNavigate: () => void };

export function MainNav({ onNavigate }: MainNavProps): ReactElement {
  return (
    <nav aria-label="Principal" className={styles.nav}>
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.isExact}
          className={navClassName}
          onClick={onNavigate}
        >
          <Icon name={link.icon} />
          {link.label}
          {link.to === ROUTE_PATH.LIVE ? <LiveNavCount /> : null}
        </NavLink>
      ))}
    </nav>
  );
}
