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

// O selo dos preços: "ao vivo", esperando o primeiro tick ou "sem dados há N s" (socket fora ou ticks velhos).
export function MarketStatusBadge(): ReactElement {
  const market = useLiveMarket();
  return (
    <span role="status" className={market.isLive ? `${styles.badge} ${styles.live}` : styles.badge}>
      <span className={styles.dot} aria-hidden="true" />
      {describe(market)}
    </span>
  );
}
