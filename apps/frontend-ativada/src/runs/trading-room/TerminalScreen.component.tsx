// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement, ReactNode } from 'react';

import { formatPrice, formatSymbol } from '../../format/format.js';
import { SIMULATION_TIMEFRAME_LABEL } from '../../goals/simulation-timeframe.constant.js';
import { PriceVariation } from '../../live/PriceVariation.component.js';
import { useShownPrice } from '../../live/useShownPrice.hook.js';
import { TerminalChartProvider } from '../candle-chart/terminal-chart.context.js';
import { TRADING_ROOM_TEXT } from './trading-room.constant.js';
import styles from './TerminalScreen.module.css';

export type TerminalScreenProps = {
  readonly symbol: string;
  readonly timeframe: string;
  readonly children: ReactNode;
};

function timeframeLabel(timeframe: string): string {
  const labels: Readonly<Record<string, string>> = SIMULATION_TIMEFRAME_LABEL;
  return labels[timeframe] ?? timeframe;
}

function TerminalHead({ symbol, timeframe }: Omit<TerminalScreenProps, 'children'>): ReactElement {
  const shown = useShownPrice(symbol);
  return (
    <div className={styles.head}>
      <h3 className={styles.symbol}>{formatSymbol(symbol)}</h3>
      <span className={styles.timeframe}>vela de {timeframeLabel(timeframe)}</span>
      <span className={styles.price} aria-label={TRADING_ROOM_TEXT.PRICE_NOW}>
        {shown === undefined ? '—' : formatPrice(shown.price)}
      </span>
      <span className={styles.averages}>
        <span className={styles.swatch20} aria-hidden="true" />
        MA20
        <span className={styles.swatch50} aria-hidden="true" />
        MA50
      </span>
      <div className={styles.variations}>
        <PriceVariation symbol={symbol} />
      </div>
    </div>
  );
}

// O telão: o gráfico de produção numa moldura de terminal, com o par, a vela, o preço e as variações no alto. Nada da
// equipe entra aqui dentro; os bonecos ficam no piso, abaixo da moldura.
export function TerminalScreen({ symbol, timeframe, children }: TerminalScreenProps): ReactElement {
  return (
    <section className={styles.terminal} aria-label={TRADING_ROOM_TEXT.SCREEN_LABEL}>
      <TerminalHead symbol={symbol} timeframe={timeframe} />
      <TerminalChartProvider>{children}</TerminalChartProvider>
      <p className={styles.foot}>{TRADING_ROOM_TEXT.DISCLAIMER}</p>
    </section>
  );
}
