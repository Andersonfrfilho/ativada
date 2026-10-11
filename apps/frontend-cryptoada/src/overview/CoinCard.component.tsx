// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatChangePercent, formatDecimal, formatSymbol } from '../format/format.js';
import { useLiveMarket } from '../live/useLiveMarket.hook.js';
import controls from '../styles/Controls.module.css';
import styles from './Overview.module.css';
import { useCoinPriceQuery } from './overview.query.js';

export type CoinCardProps = { readonly symbol: string };

type Shown = { readonly price: string; readonly change: number | undefined };

// O tick vivo vale enquanto o socket e os ticks estão em dia; senão, o último fechamento lido por REST.
function useShownPrice(symbol: string): Shown | undefined {
  const market = useLiveMarket();
  const rest = useCoinPriceQuery(symbol).data;
  const live = market.prices.get(symbol);
  if (market.isLive && live !== undefined && !live.isStale) {
    return { price: live.price, change: live.change24h };
  }
  return rest === null || rest === undefined
    ? undefined
    : { price: rest.price, change: rest.changeRatio };
}

export function CoinCard({ symbol }: CoinCardProps): ReactElement {
  const shown = useShownPrice(symbol);
  const name = formatSymbol(symbol);
  return (
    <article className={styles.coin} aria-label={name}>
      <h3 className={styles.coinName}>{name}</h3>
      {shown === undefined ? (
        <p className={controls.muted}>Sem preço ainda</p>
      ) : (
        <>
          <p className={styles.coinPrice}>{formatDecimal(shown.price)}</p>
          <p
            className={
              shown.change === undefined || shown.change >= 0 ? styles.positive : styles.negative
            }
          >
            {shown.change === undefined ? '—' : `${formatChangePercent(shown.change)} em 24 h`}
          </p>
        </>
      )}
    </article>
  );
}
