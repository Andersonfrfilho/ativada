// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon } from '../layout/Icon.component.js';
import { formatSignedPercentDown, parseScaled } from '../format/decimal.js';
import { LevelRuler } from './LevelRuler.component.js';
import styles from './Notices.module.css';
import { NOTICE_KIND, NOTICE_STATE } from './notice.constant.js';
import type { Notice } from './notice.validation.js';
import { buildRuler, RULER_CURSOR, toTypographicMinus, type RulerModel } from './level-ruler.js';
import { describeNoticePair, describeWhen, fillTimeTokens } from './notice-text.js';
import { describeTone } from './notice-tone.js';
import { formatPriceAtTick } from './symbol-filters.js';

const ZERO = 0n;

// A ficha existe quando o aviso tem os três níveis: compra executada ou venda (RF23).
export function buildNoticeRuler(notice: Notice): RulerModel | undefined {
  const isSignal =
    (notice.kind === NOTICE_KIND.ENTRY && notice.state === NOTICE_STATE.FILLED) ||
    notice.kind === NOTICE_KIND.EXIT;
  const { entryPrice, targetPrice, stopPrice } = notice;
  if (!isSignal || entryPrice === null || targetPrice === null || stopPrice === null)
    return undefined;
  const isExit = notice.kind === NOTICE_KIND.EXIT && notice.price !== null;
  return buildRuler({
    symbol: notice.symbol,
    entry: entryPrice,
    target: targetPrice,
    stop: stopPrice,
    cursor:
      isExit && notice.price !== null
        ? { kind: RULER_CURSOR.EXIT, price: notice.price }
        : undefined,
  });
}

// "▼ −0,13% no saldo": seta + sinal + palavra + cor; positivo usa o verde, zero é cinza com "=".
function ResultLine({ resultRate }: { readonly resultRate: string }): ReactElement | null {
  const rate = parseScaled(resultRate);
  if (rate === undefined) return null;
  const tone = rate > ZERO ? 'gain' : rate < ZERO ? 'loss' : 'flat';
  const text = rate === ZERO ? '= 0,00%' : toTypographicMinus(formatSignedPercentDown(rate));
  return (
    <p className={`${styles['result']} ${styles[`result-${tone}`]}`}>
      <Icon name={rate > ZERO ? 'arrowUp' : rate < ZERO ? 'arrowDown' : 'equal'} size={16} />
      {text} no saldo da simulação
    </p>
  );
}

type SignalCardProps = {
  readonly notice: Notice;
  readonly ruler: RulerModel;
  readonly now: number;
  readonly timeZone: string;
};

// RF23: selo grande (seta + COMPRA ou VENDA + cor), o preço em destaque, a hora, a linha direta e a régua dos níveis.
export function SignalCard({ notice, ruler, now, timeZone }: SignalCardProps): ReactElement {
  const tone = describeTone(notice);
  const when = describeWhen({ occurredAt: notice.occurredAt, now, timeZone });
  return (
    <div className={`${styles['signal']} ${styles[tone.tone]}`}>
      <div className={styles['signalHead']}>
        <span className={styles['seal']}>
          <Icon name={tone.icon} size={26} />
          <span>{tone.word.toUpperCase()}</span>
        </span>
        <div>
          <p className={styles['bigPrice']}>
            {notice.price === null ? '—' : formatPriceAtTick(notice.symbol, notice.price)}
          </p>
          <p className={styles['signalTime']}>
            {describeNoticePair(notice)} · {when}
          </p>
        </div>
      </div>
      <p className={styles['main']}>{fillTimeTokens(notice.message, notice, timeZone)}</p>
      {notice.resultRate === null ? null : <ResultLine resultRate={notice.resultRate} />}
      <LevelRuler model={ruler} />
    </div>
  );
}
