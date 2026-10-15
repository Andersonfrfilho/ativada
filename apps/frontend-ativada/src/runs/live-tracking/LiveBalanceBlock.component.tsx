// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import {
  formatScaled,
  formatSignedScaled,
  parseScaled,
  roundScaledDirected,
} from '../../format/decimal.js';
import { Term } from '../../glossary/Term.component.js';
import { Icon, type IconName } from '../../layout/Icon.component.js';
import { formatDirectedMoney } from '../directed-money.js';
import { formatDirectedPercent, type ResultTrend } from './decision-text.js';
import type { LiveStatus } from './live-status.validation.js';
import styles from './LiveTracking.module.css';

const CENTS = 2;
const ZERO = 0n;
const MISSING_TEXT = '—';

const TREND_ICON: Readonly<Record<ResultTrend, IconName>> = {
  gain: 'arrowUp',
  loss: 'arrowDown',
  flat: 'equal',
};

const TREND_CLASS: Readonly<Record<ResultTrend, string | undefined>> = {
  gain: styles.up,
  loss: styles.down,
  flat: styles.flat,
};

const TREND_NOTE: Readonly<Record<ResultTrend, string>> = {
  gain: 'acima do início',
  loss: 'abaixo do início',
  flat: 'igual ao início',
};

type SignedMoney = { readonly text: string; readonly trend: ResultTrend };

// O valor desce sempre (ganho menor, perda maior); zero exato é cinza e leva "=" na frente, nunca sinal de ganho.
function signedMoney(amount: bigint): SignedMoney {
  const rounded = roundScaledDirected(amount, CENTS, 'down');
  if (rounded === ZERO) return { text: `= ${formatScaled(rounded)}`, trend: 'flat' };
  return { text: formatSignedScaled(rounded), trend: rounded > ZERO ? 'gain' : 'loss' };
}

function Delta({
  trend,
  children,
}: {
  readonly trend: ResultTrend;
  readonly children: string;
}): ReactElement {
  return (
    <span className={`${styles.delta} ${TREND_CLASS[trend] ?? ''}`}>
      <Icon name={TREND_ICON[trend]} size={14} />
      {children}
    </span>
  );
}

function ResultKpi({ balance }: { readonly balance: LiveStatus['balance'] }): ReactElement {
  const amount = parseScaled(balance.result);
  const money =
    amount === undefined ? { text: MISSING_TEXT, trend: 'flat' as const } : signedMoney(amount);
  return (
    <div className={styles.kpi}>
      <p className={styles.kpiLabel}>
        <Icon name={TREND_ICON[money.trend]} size={14} />
        Resultado
      </p>
      <p className={styles.kpiValue}>
        <Delta trend={money.trend}>{money.text}</Delta>
        <span className={styles.unit}>
          USDT · {formatDirectedPercent(balance.resultRate, 'down')}
        </span>
      </p>
      <p className={styles.kpiNote}>{TREND_NOTE[money.trend]}</p>
    </div>
  );
}

function BuyAndHoldKpi({
  buyAndHold,
  initial,
}: {
  readonly buyAndHold: NonNullable<LiveStatus['buyAndHold']>;
  readonly initial: string;
}): ReactElement {
  const value = parseScaled(buyAndHold.value);
  const start = parseScaled(initial);
  const difference =
    value === undefined || start === undefined ? undefined : signedMoney(value - start);
  const trend = difference?.trend ?? 'flat';
  return (
    <div className={styles.kpi}>
      <p className={styles.kpiLabel}>
        <Icon name={TREND_ICON[trend]} size={14} />
        <Term term="buyAndHold">Se tivesse comprado e segurado</Term>
      </p>
      <p className={styles.kpiValue}>
        {formatDirectedMoney(buyAndHold.value, 'down')}
        <span className={styles.unit}>USDT</span>
      </p>
      <p className={styles.kpiNote}>
        <Delta trend={trend}>
          {`${difference?.text ?? MISSING_TEXT} · ${formatDirectedPercent(buyAndHold.resultRate, 'down')}`}
        </Delta>
      </p>
    </div>
  );
}

function isBenchmarkFalling(buyAndHold: NonNullable<LiveStatus['buyAndHold']>): boolean {
  return buyAndHold.resultRate.startsWith('-');
}

// A frase do servidor diz quanto acima ou abaixo; sem compra e com o preço caindo, o painel acrescenta de onde vem a vantagem.
function describeVerdict(status: LiveStatus): string | undefined {
  const { buyAndHold, balance } = status;
  if (buyAndHold === null) return undefined;
  const isFlat = parseScaled(balance.result) === ZERO;
  if (buyAndHold.comparison === 'above' && isFlat && isBenchmarkFalling(buyAndHold)) {
    return `${buyAndHold.message} Não é lucro: é a perda que a estratégia evitou ao ficar de fora.`;
  }
  return buyAndHold.message;
}

// Saldo agora, resultado e a comparação com comprar e segurar (RF02 e RF03), com os números do servidor.
export function LiveBalanceBlock({ status }: { readonly status: LiveStatus }): ReactElement {
  const { balance, buyAndHold } = status;
  const verdict = describeVerdict(status);
  return (
    <>
      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <p className={styles.kpiLabel}>
            <Icon name="wallet" size={14} />
            Saldo agora
          </p>
          <p className={styles.kpiValue}>
            {formatDirectedMoney(balance.current, 'down')}
            <span className={styles.unit}>USDT</span>
          </p>
          <p className={styles.kpiNote}>
            começou com {formatDirectedMoney(balance.initial, 'down')}
          </p>
        </div>
        <ResultKpi balance={balance} />
        {buyAndHold === null ? null : (
          <BuyAndHoldKpi buyAndHold={buyAndHold} initial={balance.initial} />
        )}
      </div>
      {balance.observedAt === null ? <p className={styles.muted}>{balance.message}</p> : null}
      {verdict === undefined ? null : (
        <div className={styles.verdict}>
          <Icon name="info" />
          <span>{verdict}</span>
        </div>
      )}
    </>
  );
}
