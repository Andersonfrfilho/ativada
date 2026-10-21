// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatChangePercent, formatSymbol } from '../../format/format.js';
import { useClock } from '../../live/useClock.hook.js';
import { useShownPrice } from '../../live/useShownPrice.hook.js';
import { clockText, heatLevel, WORLD_CLOCKS } from './wall-model.js';
import styles from './Wall.module.css';

const CLOCK_MILLISECONDS = 30_000;

// Os relógios do mundo (decorativos para o leitor de tela: a hora do usuário está no quadro da próxima vela).
export function WallClocks(): ReactElement {
  const now = useClock(CLOCK_MILLISECONDS);
  return (
    <div className={styles.screen} aria-hidden="true">
      <p className={styles.screenTitle}>Relógios</p>
      <ul className={styles.clocks}>
        {WORLD_CLOCKS.map(({ city, zone }) => (
          <li key={zone}>
            <span>{city}</span>
            <b>{clockText(now, zone)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function directionOf(change: number | undefined): 'up' | 'down' | 'flat' {
  if (change === undefined || change === 0) return 'flat';
  return change > 0 ? 'up' : 'down';
}

function HeatCell({ symbol }: { readonly symbol: string }): ReactElement {
  const change = useShownPrice(symbol)?.change;
  const direction = directionOf(change);
  return (
    <li
      className={styles.heat}
      data-direction={direction}
      data-level={change === undefined ? 0 : heatLevel(change)}
    >
      <b>{formatSymbol(symbol).split('/')[0]}</b>
      <span>{change === undefined ? '—' : formatChangePercent(change)}</span>
    </li>
  );
}

// O mapa de calor dos pares habilitados: a variação de 24 h dos dados de preço que o painel já tem.
export function WallHeatmap({ symbols }: { readonly symbols: readonly string[] }): ReactElement {
  return (
    <section className={styles.screen} aria-label="Mapa de calor · 24 h">
      <p className={styles.screenTitle} aria-hidden="true">
        Mapa de calor · 24 h
      </p>
      <ul className={styles.heatGrid}>
        {symbols.map((symbol) => (
          <HeatCell key={symbol} symbol={symbol} />
        ))}
      </ul>
    </section>
  );
}
