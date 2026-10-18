// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { BALCONY_SLOT, type BalconySlot } from '../balcony/balcony.constant.js';
import styles from './IsoDesk.module.css';

export type ScreenKind =
  'trend' | 'reversion' | 'volume' | 'sentiment' | 'risk' | 'audit' | 'model';

const KIND_OF: Readonly<Record<BalconySlot, ScreenKind>> = {
  [BALCONY_SLOT.TIAGO]: 'trend',
  [BALCONY_SLOT.RENATA]: 'reversion',
  [BALCONY_SLOT.VITOR]: 'volume',
  [BALCONY_SLOT.SOFIA]: 'sentiment',
  [BALCONY_SLOT.ALICE]: 'risk',
  [BALCONY_SLOT.OTAVIO]: 'audit',
  [BALCONY_SLOT.NINA]: 'model',
  [BALCONY_SLOT.LUCAS]: 'model',
  [BALCONY_SLOT.OLIVIA]: 'model',
};

export function screenKindOf(slot: BalconySlot): ScreenKind {
  return KIND_OF[slot];
}

type ChartPath = {
  readonly tone: 'lineGood' | 'lineSoft' | 'lineBad' | 'bars';
  readonly d: string;
};

// Os gráficos das telas são ilustração (sem número): as leituras reais estão nos crachás e no telão do escritório frontal.
const PATHS: Readonly<Record<ScreenKind, readonly ChartPath[]>> = {
  trend: [
    { tone: 'lineSoft', d: 'M2 21 10 19 18 17 26 14 34 11 44 9' },
    { tone: 'lineGood', d: 'M2 20 8 16 14 17 20 11 27 12 34 6 44 4' },
  ],
  reversion: [
    { tone: 'lineSoft', d: 'M2 6H44M2 19H44' },
    { tone: 'lineGood', d: 'M2 12 8 17 14 8 20 18 27 9 34 16 44 10' },
  ],
  volume: [{ tone: 'bars', d: 'M5 22V16M11 22V10M17 22V14M23 22V6M29 22V12M35 22V8M41 22V15' }],
  sentiment: [
    { tone: 'lineSoft', d: 'M9 19A14 14 0 0 1 37 19' },
    { tone: 'lineGood', d: 'M9 19A14 14 0 0 1 20 7' },
  ],
  risk: [
    { tone: 'lineSoft', d: 'M2 7H44' },
    { tone: 'lineBad', d: 'M2 18H44' },
    { tone: 'lineGood', d: 'M2 14 12 11 22 12 32 8 44 10' },
  ],
  audit: [
    { tone: 'lineSoft', d: 'M2 12H44' },
    { tone: 'bars', d: 'M8 22V9M18 22V15M28 22V7M38 22V13' },
  ],
  model: [{ tone: 'lineGood', d: 'M23 4 31 12 23 20 15 12z' }],
};

// A tela do computador na mesa: fundo escuro de tela e um gráfico por pessoa.
export function IsoScreen({ slot }: { readonly slot: BalconySlot }): ReactElement {
  const kind = screenKindOf(slot);
  return (
    <svg
      className={styles.chart}
      viewBox="0 0 46 25"
      data-chart={kind}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[kind].map((path) => (
        <path key={path.d} className={styles[path.tone]} d={path.d} />
      ))}
    </svg>
  );
}
