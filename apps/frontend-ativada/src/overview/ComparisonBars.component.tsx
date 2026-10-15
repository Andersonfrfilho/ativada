// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { RunResultBar } from '../backtests/RunResultBar.component.js';
import { divideFloor, parseScaled } from '../format/decimal.js';
import { formatDecimal } from '../format/format.js';
import styles from './Overview.module.css';

const PERCENT_SCALE = 1_000_000n;
const SCALE_STEPS_PERCENT: readonly bigint[] = [3n, 5n, 10n, 20n, 50n, 100n];
const MINUS = '−';
const ZERO = 0n;

export type ComparisonBarsProps = {
  readonly initial: string;
  readonly equity: string;
  readonly benchmark: string;
};

function rateOf(value: string, initial: bigint): bigint | undefined {
  const parsed = parseScaled(value);
  return parsed === undefined ? undefined : divideFloor(parsed - initial, initial);
}

function absolute(value: bigint): bigint {
  return value < ZERO ? -value : value;
}

// A menor escala redonda que cabe nas duas barras: com ±3% a diferença pequena ainda aparece.
function pickScaleLimit(rates: readonly bigint[]): bigint {
  const largest = rates.reduce(
    (current, rate) => (absolute(rate) > current ? absolute(rate) : current),
    ZERO,
  );
  const step = SCALE_STEPS_PERCENT.find((percent) => percent * PERCENT_SCALE >= largest);
  return (step ?? SCALE_STEPS_PERCENT.at(-1) ?? 3n) * PERCENT_SCALE;
}

type RowProps = {
  readonly name: string;
  readonly note: string;
  readonly rate: bigint;
  readonly scaleLimit: bigint;
};

function ComparisonRow({ name, note, rate, scaleLimit }: RowProps): ReactElement {
  return (
    <div className={styles.compareRow}>
      <span className={styles.compareName}>
        {name}
        <small>{note}</small>
      </span>
      <RunResultBar result={rate} scaleLimit={scaleLimit} />
    </div>
  );
}

// Duas barras a partir do zero na mesma escala: a simulação contra "comprar e segurar" (redesenho aprovado).
export function ComparisonBars({
  initial,
  equity,
  benchmark,
}: ComparisonBarsProps): ReactElement | null {
  const start = parseScaled(initial);
  if (start === undefined) return null;
  const own = rateOf(equity, start);
  const held = rateOf(benchmark, start);
  if (own === undefined || held === undefined) return null;
  const scaleLimit = pickScaleLimit([own, held]);
  const limitText = String(scaleLimit / PERCENT_SCALE);
  return (
    <div className={styles.compare} role="group" aria-label="Comparação com comprar e segurar">
      <p className={styles.compareScale} aria-hidden="true">
        <span>{`${MINUS}${limitText}%`}</span>
        <span>0</span>
        <span>{`+${limitText}%`}</span>
      </p>
      <ComparisonRow
        name="Sua simulação"
        note="o que o robô fez"
        rate={own}
        scaleLimit={scaleLimit}
      />
      <ComparisonRow
        name="Comprar e segurar"
        note={`teria hoje ${formatDecimal(benchmark)} USDT`}
        rate={held}
        scaleLimit={scaleLimit}
      />
    </div>
  );
}
