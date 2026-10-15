// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatSignedScaledPercent } from '../format/decimal.js';
import { Icon, type IconName } from '../layout/Icon.component.js';
import styles from './BacktestGroups.module.css';

// A barra vai de −20% a +20% (o redesenho aprovado); acima disso ela encosta na borda.
const SCALE_LIMIT = 20_000_000n;
const HALF_TRACK_BASIS_POINTS = 5_000n;
const BASIS_POINTS_PER_PERCENT = 100;
const ZERO = 0n;
const MINUS = '−';

type Look = {
  readonly icon: IconName;
  readonly className: string | undefined;
  readonly text: string;
};

function lookOf(result: bigint): Look {
  if (result === ZERO) return { icon: 'equal', className: styles.flat, text: '= 0,00%' };
  const text = formatSignedScaledPercent(result).replace('-', MINUS);
  return result > ZERO
    ? { icon: 'arrowUp', className: styles.up, text }
    : { icon: 'arrowDown', className: styles.down, text };
}

function halfWidthPercent(result: bigint): number {
  const magnitude = result < ZERO ? -result : result;
  const basisPoints = (magnitude * HALF_TRACK_BASIS_POINTS) / SCALE_LIMIT;
  const capped = basisPoints > HALF_TRACK_BASIS_POINTS ? HALF_TRACK_BASIS_POINTS : basisPoints;
  return Number(capped) / BASIS_POINTS_PER_PERCENT;
}

// Resultado = barra a partir do zero + seta + sinal: a cor nunca fala sozinha.
export function RunResultBar({ result }: { readonly result: bigint }): ReactElement {
  const look = lookOf(result);
  const width = halfWidthPercent(result);
  const isGain = result > ZERO;
  return (
    <div className={styles.result}>
      <svg className={styles.resultTrack} aria-hidden="true" focusable="false">
        <line className={styles.zeroLine} x1="50%" x2="50%" y1="0" y2="100%" />
        {result === ZERO ? null : (
          <rect
            className={isGain ? styles.barGain : styles.barLoss}
            x={`${isGain ? 50 : 50 - width}%`}
            y="3"
            width={`${width}%`}
            height="8"
            rx="3"
          />
        )}
      </svg>
      <span className={`${styles.delta} ${look.className ?? ''}`}>
        <Icon name={look.icon} size={14} />
        {look.text}
      </span>
    </div>
  );
}
