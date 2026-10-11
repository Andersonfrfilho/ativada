// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatChangePercent, formatDecimal, formatSymbol } from '../format/format.js';
import { useShownPrice } from '../live/useShownPrice.hook.js';
import controls from '../styles/Controls.module.css';
import styles from './Overview.module.css';

export type CoinCardProps = { readonly symbol: string };

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
