// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { parseScaled } from '../format/decimal.js';
import type { IconName } from '../layout/Icon.component.js';
import { RunResultBar } from '../backtests/RunResultBar.component.js';
import { describeLiveResult, type ResultTrend } from '../runs/live-tracking/decision-text.js';
import {
  CHIP_TONE,
  StatusChip,
  type ChipTone,
} from '../runs/live-tracking/StatusChip.component.js';
import { pickScaleLimit } from './ComparisonBars.component.js';
import styles from './LiveSimulations.module.css';
import { SIM_STATE, type SimState } from './live-simulations.js';
import type { LiveSummaryItem } from './live-summary.validation.js';

const STATE_LOOK: Readonly<Record<SimState, { tone: ChipTone; icon: IconName; label: string }>> = {
  running: { tone: CHIP_TONE.BUY, icon: 'activity', label: 'Rodando' },
  queued: { tone: CHIP_TONE.NEUTRAL, icon: 'pause', label: 'Na fila' },
  stalled: { tone: CHIP_TONE.WARN, icon: 'alert', label: 'Parada' },
  waiting: { tone: CHIP_TONE.INFO, icon: 'info', label: 'Esperando dados' },
};

const RESULT_LOOK: Readonly<Record<ResultTrend, { tone: ChipTone; icon: IconName; word: string }>> =
  {
    gain: { tone: CHIP_TONE.BUY, icon: 'arrowUp', word: 'Ganho' },
    loss: { tone: CHIP_TONE.SELL, icon: 'arrowDown', word: 'Perda' },
    flat: { tone: CHIP_TONE.NEUTRAL, icon: 'equal', word: 'Sem ganho nem perda' },
  };

const COMPARISON_TEXT: Readonly<Record<'above' | 'even' | 'below', string>> = {
  above: 'À frente de comprar e segurar',
  even: 'Igual a comprar e segurar',
  below: 'Atrás de comprar e segurar',
};

const ANALYST_TEXT: Readonly<Record<string, string>> = {
  shadow: 'com analista (sombra)',
  govern: 'com analista (governa)',
};

export function StateChip({ state }: { readonly state: SimState }): ReactElement {
  const look = STATE_LOOK[state];
  return (
    <StatusChip tone={look.tone} icon={look.icon}>
      {look.label}
    </StatusChip>
  );
}

export function isTradingState(state: SimState): boolean {
  return state === SIM_STATE.RUNNING || state === SIM_STATE.WAITING;
}

export function AnalystBadge({ mode }: { readonly mode: string | null }): ReactElement | null {
  if (mode === null) return null;
  return (
    <StatusChip tone={CHIP_TONE.INFO} icon="eye">
      {ANALYST_TEXT[mode] ?? 'com analista'}
    </StatusChip>
  );
}

// Ícone + palavra + cor: o zero é cinza com "=", e o texto já vem arredondado para baixo.
export function ResultChip({
  result,
  rate,
}: {
  readonly result: string;
  readonly rate: string;
}): ReactElement {
  const text = describeLiveResult(result, rate);
  const look = RESULT_LOOK[text.trend];
  return (
    <StatusChip tone={look.tone} icon={look.icon}>
      {`${look.word}: ${text.text.replace(' (', ' USDT (')}`}
    </StatusChip>
  );
}

// Duas barras pequenas na mesma escala: a simulação contra "comprar e segurar".
export function MiniComparison({ summary }: { readonly summary: LiveSummaryItem }): ReactElement {
  const own = parseScaled(summary.resultRate);
  const held = parseScaled(summary.buyAndHold?.resultRate ?? '');
  if (summary.buyAndHold === null || own === undefined || held === undefined) {
    return <p className={styles.muted}>Comparação com comprar e segurar: aparece na 1ª vela.</p>;
  }
  const scaleLimit = pickScaleLimit([own, held]);
  return (
    <div className={styles.compare} role="group" aria-label="Comparação com comprar e segurar">
      <span className={styles.compareName}>Esta simulação</span>
      <RunResultBar result={own} scaleLimit={scaleLimit} />
      <span className={styles.compareName}>Comprar e segurar</span>
      <RunResultBar result={held} scaleLimit={scaleLimit} />
      <span className={styles.compareVerdict}>
        {COMPARISON_TEXT[summary.buyAndHold.comparison]}
      </span>
    </div>
  );
}
