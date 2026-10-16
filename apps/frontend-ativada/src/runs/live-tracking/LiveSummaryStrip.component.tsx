// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement, type ReactNode } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { Term } from '../../glossary/Term.component.js';
import { Icon, type IconName } from '../../layout/Icon.component.js';
import { formatDirectedMoney } from '../directed-money.js';
import { describeLiveResult, formatDirectedPercent, type ResultTrend } from './decision-text.js';
import { formatDayAndTime } from './goal-text.js';
import { GOAL_OUTCOME_TEXT } from './LiveGoalBlock.component.js';
import type { LiveGoal, LiveStatus } from './live-status.validation.js';
import styles from './LiveSummary.module.css';

const TREND_ICON: Readonly<Record<ResultTrend, IconName>> = {
  gain: 'arrowUp',
  loss: 'arrowDown',
  flat: 'equal',
};

const TREND_CLASS: Readonly<Record<ResultTrend, string | undefined>> = {
  gain: styles.up,
  loss: styles.down,
  flat: undefined,
};

const TREND_WORD: Readonly<Record<ResultTrend, string>> = {
  gain: 'acima do início',
  loss: 'abaixo do início',
  flat: 'igual ao início',
};

function trendOfPercent(percent: string): ResultTrend {
  if (percent.startsWith('+')) return 'gain';
  return /^[−-]/.test(percent) ? 'loss' : 'flat';
}

type TileProps = {
  readonly icon: IconName;
  readonly label: ReactNode;
  readonly trend?: ResultTrend;
  readonly note: ReactNode;
  readonly children: ReactNode;
};

function Tile({ icon, label, trend, note, children }: TileProps): ReactElement {
  const toneClass = trend === undefined ? undefined : TREND_CLASS[trend];
  return (
    <div className={styles.tile}>
      <p className={styles.label}>
        <Icon name={icon} size={14} />
        {label}
      </p>
      <p className={`${styles.value} ${toneClass ?? ''}`}>{children}</p>
      <p className={styles.note}>{note}</p>
    </div>
  );
}

function BuyAndHoldTile({ status }: { readonly status: LiveStatus }): ReactElement | null {
  const { buyAndHold } = status;
  if (buyAndHold === null) return null;
  const percent = formatDirectedPercent(buyAndHold.resultRate, 'down');
  const trend = trendOfPercent(percent);
  return (
    <Tile
      icon={TREND_ICON[trend]}
      trend={trend}
      label={<Term term="buyAndHold">Comprar e segurar</Term>}
      note={`${TREND_WORD[trend]} · ${formatDirectedMoney(buyAndHold.value, 'down')} USDT`}
    >
      {percent}
    </Tile>
  );
}

function goalValue(goal: LiveGoal): string {
  if (goal.outcome !== null) return GOAL_OUTCOME_TEXT[goal.outcome];
  return `faltam ${formatDirectedMoney(goal.remainingAmount, 'up')} USDT`;
}

function GoalTile({ goal }: { readonly goal: LiveGoal | null }): ReactElement | null {
  const timeZone = useUserTimeZone();
  if (goal === null) return null;
  const note =
    goal.outcome === null
      ? `para chegar a ${formatDirectedMoney(goal.targetAmount, 'up')} até ${formatDayAndTime(goal.deadlineAt, timeZone)}`
      : 'a meta desta simulação';
  return (
    <Tile icon="goals" label="Meta" note={note}>
      {goalValue(goal)}
    </Tile>
  );
}

// O resumo curto do topo (saldo, resultado, comprar e segurar, meta), com os números do servidor; o detalhe fica no cartão "Acompanhamento".
export function LiveSummaryStrip({ status }: { readonly status: LiveStatus }): ReactElement {
  const headingId = useId();
  const { balance } = status;
  const result = describeLiveResult(balance.result, balance.resultRate);
  return (
    <section className={styles.strip} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.title}>
        Sua simulação ao vivo
      </h2>
      <div className={styles.tiles}>
        <Tile
          icon="wallet"
          label="Saldo"
          note={`começou com ${formatDirectedMoney(balance.initial, 'down')}`}
        >
          {formatDirectedMoney(balance.current, 'down')} USDT
        </Tile>
        <Tile
          icon={TREND_ICON[result.trend]}
          trend={result.trend}
          label="Resultado"
          note={TREND_WORD[result.trend]}
        >
          {result.text}
        </Tile>
        <BuyAndHoldTile status={status} />
        <GoalTile goal={status.goal} />
      </div>
    </section>
  );
}
