// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../account/useUserTimeZone.hook.js';
import { formatDecimal, formatSymbol } from '../format/format.js';
import type { IconName } from '../layout/Icon.component.js';
import { describeLiveResult, type ResultTrend } from '../runs/live-tracking/decision-text.js';
import { formatDayAndTime } from '../runs/live-tracking/goal-text.js';
import type { LiveStatus } from '../runs/live-tracking/live-status.validation.js';
import {
  CHIP_TONE,
  StatusChip,
  type ChipTone,
} from '../runs/live-tracking/StatusChip.component.js';
import type { RunDetail } from '../runs/run.validation.js';
import controls from '../styles/Controls.module.css';
import styles from './Overview.module.css';
import { describeCandle } from './running-for.js';

const TREND_LOOK: Readonly<Record<ResultTrend, { tone: ChipTone; icon: IconName }>> = {
  gain: { tone: CHIP_TONE.BUY, icon: 'arrowUp' },
  loss: { tone: CHIP_TONE.SELL, icon: 'arrowDown' },
  flat: { tone: CHIP_TONE.NEUTRAL, icon: 'equal' },
};

// "= 0,00 USDT (0,00%) desde o início": o texto do resultado já vem arredondado para baixo.
function ResultChip({ balance }: { readonly balance: LiveStatus['balance'] }): ReactElement {
  const result = describeLiveResult(balance.result, balance.resultRate);
  const look = TREND_LOOK[result.trend];
  return (
    <StatusChip tone={look.tone} icon={look.icon}>
      {`${result.text.replace(' (', ' USDT (')} desde o início`}
    </StatusChip>
  );
}

export type BalanceHeroProps = {
  readonly run: RunDetail;
  readonly equity: string;
  readonly status: LiveStatus | undefined;
  readonly hasTrades: boolean | undefined;
};

function describeContext(props: BalanceHeroProps): string {
  const initial = props.run.survival?.initialBalance;
  if (initial === undefined) return 'Saldo inicial indisponível.';
  const started = `Começou com ${formatDecimal(initial)} USDT.`;
  const isFlat =
    props.status !== undefined && props.status.balance.result.replace(/[0.-]/g, '') === '';
  return isFlat && props.hasTrades === false
    ? `${started} Ainda não comprou nada, por isso o saldo não mudou.`
    : started;
}

// O cartão-herói (redesenho aprovado): para onde olhar primeiro é o saldo, grande, com o resultado ao lado.
export function BalanceHero(props: BalanceHeroProps): ReactElement {
  const timeZone = useUserTimeZone();
  const { run } = props;
  return (
    <>
      <p className={styles.eyebrow}>
        {formatSymbol(run.symbol)} · {describeCandle(run.timeframe)} · desde{' '}
        {formatDayAndTime(run.periodStart, timeZone)}
      </p>
      <p className={controls.muted}>Saldo agora</p>
      <p className={styles.bigNumber}>
        {formatDecimal(props.equity)} <span className={styles.unit}>USDT</span>
        {props.status === undefined ? null : (
          <span className={styles.heroChip}>
            <ResultChip balance={props.status.balance} />
          </span>
        )}
      </p>
      <p className={controls.muted}>{describeContext(props)}</p>
    </>
  );
}
