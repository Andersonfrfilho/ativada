// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatChangePercent, formatPrice, formatSymbol } from '../../format/format.js';
import { useShownPrice } from '../../live/useShownPrice.hook.js';
import styles from './Wall.module.css';

function TickerItem({ symbol }: { readonly symbol: string }): ReactElement {
  const shown = useShownPrice(symbol);
  const change = shown?.change;
  const direction = change === undefined || change === 0 ? 'flat' : change > 0 ? 'up' : 'down';
  return (
    <span className={styles.tick} data-direction={direction}>
      <b>{formatSymbol(symbol).split('/')[0]}</b>{' '}
      {shown === undefined ? '—' : formatPrice(shown.price)}{' '}
      <i>{change === undefined ? '' : formatChangePercent(change)}</i>
    </span>
  );
}

// O letreiro com os pares habilitados. A segunda cópia só existe para o letreiro correr sem emenda; o leitor de tela
// não a lê (e o letreiro inteiro é decorativo: o preço do par da simulação está no telão).
export function WallTicker({ symbols }: { readonly symbols: readonly string[] }): ReactElement {
  const items = symbols.map((symbol) => <TickerItem key={symbol} symbol={symbol} />);
  return (
    <div className={styles.ticker} aria-hidden="true">
      <div className={styles.tickerRun}>
        {items}
        {items.map((item) => (
          <span key={`copy-${item.key ?? ''}`}>{item}</span>
        ))}
      </div>
    </div>
  );
}
