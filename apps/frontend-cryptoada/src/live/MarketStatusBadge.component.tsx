// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './LiveStatusBadge.module.css';
import { useLiveMarket, type LiveMarket } from './useLiveMarket.hook.js';

function describe(market: LiveMarket): string {
  if (market.state === 'live') return 'Preços ao vivo';
  if (market.state === 'waiting') return 'Aguardando preços';
  return market.secondsWithoutData === undefined
    ? 'Sem dados'
    : `Sem dados há ${market.secondsWithoutData} s`;
}

const STATE_TEXT: Readonly<Record<LiveMarket['state'], string>> = {
  live: 'ao vivo',
  waiting: 'aguardando',
  stale: 'sem dados',
  offline: 'sem dados',
};

// O texto com os segundos muda toda hora e fica fora do leitor de tela; só a região de estado, que muda uma vez por troca, é anunciada.
export function MarketStatusBadge(): ReactElement {
  const market = useLiveMarket();
  return (
    <span className={market.isLive ? `${styles.badge} ${styles.live}` : styles.badge}>
      <span className={styles.dot} aria-hidden="true" />
      <span aria-hidden="true">{describe(market)}</span>
      <span role="status" className={styles.srOnly}>
        Estado dos preços: {STATE_TEXT[market.state]}
      </span>
    </span>
  );
}
