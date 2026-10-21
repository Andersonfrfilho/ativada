// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement } from 'react';

import { ManualCopyButtons } from './ManualCopyButtons.component.js';
import { MyBalanceField } from './MyBalanceField.component.js';
import styles from './Notices.module.css';
import { TIME_TOKEN } from './notice.constant.js';
import type { Notice, NoticeManual } from './notice.validation.js';
import { buildCopyTexts, computeProportionalQuantity } from './manual-trade.js';
import { readMyBalance } from './my-balance.js';
import { formatPriceAtTick, formatQuantity } from './symbol-filters.js';
import { formatSymbol, formatTimeInZoneText } from './notice-text.js';
import { useNoticeCenter } from './useNoticeCenter.hook.js';

const QUOTE_SUFFIX = 'USDT';
const MANUAL_STEPS: readonly string[] = [
  'Abra o par na corretora (botão acima).',
  'Cole o preço e a quantidade na ordem de compra.',
  'Cadastre o alvo e a proteção (ou uma ordem OCO, que junta as duas).',
];

function fillManualTokens(params: {
  readonly text: string;
  readonly notice: Notice;
  readonly manual: NoticeManual;
  readonly timeZone: string;
}): string {
  const { text, notice, manual, timeZone } = params;
  const decided = formatTimeInZoneText(manual.decidedAt, timeZone);
  const confirmed = formatTimeInZoneText(notice.occurredAt, timeZone);
  return text.replaceAll(TIME_TOKEN.DECIDED, decided).replaceAll(TIME_TOKEN.CONFIRMED, confirmed);
}

// A quantidade da simulação na proporção do "Meu saldo" da pessoa (BigInt, para baixo no passo do par).
function proportionalOf(manual: NoticeManual, myBalance: string | undefined): string | undefined {
  const { quantity, runBalance, quantityStep } = manual;
  if (myBalance === undefined || quantity === null || runBalance === null) return undefined;
  if (quantityStep === null) return undefined;
  return computeProportionalQuantity({ quantity, runBalance, myBalance, quantityStep });
}

function ProportionalLine(props: {
  readonly symbol: string;
  readonly quantity: string | undefined;
  readonly myBalance: string | undefined;
}): ReactElement | null {
  const { symbol, quantity, myBalance } = props;
  if (myBalance === undefined || quantity === undefined) return null;
  const base = symbol.endsWith(QUOTE_SUFFIX) ? symbol.slice(0, -QUOTE_SUFFIX.length) : symbol;
  return (
    <p className={styles['detail']}>
      Com {myBalance.replace('.', ',')} USDT, a mesma proporção dá{' '}
      <strong>
        {formatQuantity(symbol, quantity)} {base}
      </strong>
      .
    </p>
  );
}

function ManualFacts(props: {
  readonly notice: Notice;
  readonly manual: NoticeManual;
}): ReactElement {
  const { notice, manual } = props;
  const { timeZone } = useNoticeCenter();
  const fill = (text: string | null): ReactElement | null =>
    text === null ? null : (
      <p className={styles['detail']}>{fillManualTokens({ text, notice, manual, timeZone })}</p>
    );
  const price = (text: string): string => formatPriceAtTick(notice.symbol, text);
  return (
    <>
      {fill(manual.how)}
      {fill(manual.quantityText)}
      <ul className={styles['orders']}>
        <li>Entrada: {price(manual.referencePrice)}</li>
        <li>Alvo (venda limitada): {price(manual.targetPrice)}</li>
        <li>Proteção: {price(manual.stopPrice)}</li>
      </ul>
      {fill(manual.costText)}
      {fill(manual.netText)}
      {fill(manual.giveUpText)}
      {fill(manual.historyText)}
    </>
  );
}

function ManualSteps(props: {
  readonly symbol: string;
  readonly manual: NoticeManual;
}): ReactElement {
  const { symbol, manual } = props;
  return (
    <ol className={styles['steps']}>
      {MANUAL_STEPS.map((step) => (
        <li key={step}>{step}</li>
      ))}
      {manual.breakEvenEntry === null ? null : (
        <li>Desista se o preço já passou de {formatPriceAtTick(symbol, manual.breakEvenEntry)}.</li>
      )}
    </ol>
  );
}

// RF27 a RF34: "Operar à mão" só MOSTRA e COPIA; o AtivAdA não envia ordem e não tem chave da corretora.
export function ManualTradePanel({ notice }: { readonly notice: Notice }): ReactElement | null {
  const { speak } = useNoticeCenter();
  const [myBalance, setMyBalance] = useState(readMyBalance);
  const { manual } = notice;
  if (manual === null) return null;
  const proportional = proportionalOf(manual, myBalance);
  const texts = buildCopyTexts({
    symbol: notice.symbol,
    referencePrice: manual.referencePrice,
    targetPrice: manual.targetPrice,
    stopPrice: manual.stopPrice,
    quantity: proportional ?? manual.quantity ?? undefined,
    quantityStep: manual.quantityStep,
  });
  return (
    <details className={styles['manual']}>
      <summary>Operar à mão · {formatSymbol(notice.symbol)}</summary>
      <ManualFacts notice={notice} manual={manual} />
      <MyBalanceField onChange={setMyBalance} />
      <ProportionalLine symbol={notice.symbol} quantity={proportional} myBalance={myBalance} />
      <ManualCopyButtons symbol={notice.symbol} texts={texts} speak={speak} />
      <ManualSteps symbol={notice.symbol} manual={manual} />
      <p className={styles['honesty']}>{manual.honesty}</p>
    </details>
  );
}
