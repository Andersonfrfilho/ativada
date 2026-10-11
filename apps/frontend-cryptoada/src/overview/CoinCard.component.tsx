// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import controls from '../styles/Controls.module.css';
import styles from './Overview.module.css';
import { useCoinPriceQuery } from './overview.query.js';
import { formatChangePercent, formatDecimal, formatSymbol } from './format.js';

export type CoinCardProps = { readonly symbol: string };

export function CoinCard({ symbol }: CoinCardProps): ReactElement {
  const price = useCoinPriceQuery(symbol);
  const name = formatSymbol(symbol);
  const change = price.data?.changeRatio;
  return (
    <article className={styles.coin} aria-label={name}>
      <h3 className={styles.coinName}>{name}</h3>
      {price.data === undefined || price.data === null ? (
        <p className={controls.muted}>{price.isError ? 'Preço indisponível' : 'Sem preço ainda'}</p>
      ) : (
        <>
          <p className={styles.coinPrice}>{formatDecimal(price.data.price)}</p>
          <p className={change === undefined || change >= 0 ? styles.positive : styles.negative}>
            {change === undefined ? '—' : `${formatChangePercent(change)} em 24 h`}
          </p>
        </>
      )}
    </article>
  );
}
