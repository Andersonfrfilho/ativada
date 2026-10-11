// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement } from 'react';

import {
  formatChangePercent,
  formatDecimal,
  formatQuantity,
  formatReais,
  formatSignedDecimal,
  formatSymbol,
} from '../format/format.js';
import { useLivePrice } from '../live/useShownPrice.hook.js';
import controls from '../styles/Controls.module.css';
import { RULE_LABEL } from './asset.constant.js';
import { computeAssetNumbers, type AssetNumbers } from './asset-math.js';
import { useDeleteAssetMutation } from './asset.query.js';
import type { AssetItem } from './asset.validation.js';
import styles from './Assets.module.css';

export type AssetCardProps = { readonly item: AssetItem; readonly rate: number | undefined };

function ValueLines({
  numbers,
  rate,
}: {
  readonly numbers: AssetNumbers;
  readonly rate: number | undefined;
}): ReactElement {
  if (numbers.value === undefined) return <p className={controls.muted}>Sem preço ainda.</p>;
  const resultRate =
    numbers.resultRate === undefined ? '' : ` (${formatChangePercent(numbers.resultRate)})`;
  return (
    <>
      <p className={styles.value}>{formatDecimal(String(numbers.value))} USDT</p>
      {rate === undefined ? null : (
        <p className={controls.muted}>≈ {formatReais(numbers.value * rate)}</p>
      )}
      <p>
        Resultado {numbers.result === undefined ? '—' : formatSignedDecimal(numbers.result)}
        {resultRate}
      </p>
    </>
  );
}

function RuleLines({
  item,
  numbers,
}: {
  readonly item: AssetItem;
  readonly numbers: AssetNumbers;
}): ReactElement {
  return (
    <>
      {item.rule === null ? null : (
        <p>
          Regra do dia: <span className={styles.rule}>{RULE_LABEL[item.rule.action]}</span>{' '}
          <span className={controls.muted}>{item.rule.situation.signal.reason}</span>
        </p>
      )}
      <p>
        Alvo {formatDecimal(item.targetPrice)} · Stop {formatDecimal(item.stopPrice)}
      </p>
      {numbers.isTargetReached === true ? <span className={styles.flag}>Alvo atingido</span> : null}
      {numbers.isStopReached === true ? <span className={styles.flag}>Stop atingido</span> : null}
    </>
  );
}

export function AssetCard({ item, rate }: AssetCardProps): ReactElement {
  const numbers = computeAssetNumbers(item, useLivePrice(item.symbol));
  const remove = useDeleteAssetMutation();
  const [isConfirming, setIsConfirming] = useState(false);
  const name = formatSymbol(item.symbol);

  function handleDelete(): void {
    if (!isConfirming) {
      setIsConfirming(true);
      return;
    }
    remove.mutate(item.symbol, { onSettled: () => setIsConfirming(false) });
  }

  return (
    <article className={styles.asset} aria-label={name}>
      <h3 className={styles.symbol}>{name}</h3>
      <p className={controls.muted}>
        Quantidade {formatQuantity(item.quantity)} · Preço médio {formatDecimal(item.averagePrice)}
      </p>
      <ValueLines numbers={numbers} rate={rate} />
      <RuleLines item={item} numbers={numbers} />
      <button type="button" className={controls.button} onClick={handleDelete}>
        {isConfirming ? `Confirmar: apagar ativo ${name}` : `Apagar ativo ${name}`}
      </button>
      {remove.isError ? (
        <p role="alert" className={controls.error}>
          Não foi possível apagar. Tente novamente.
        </p>
      ) : null}
    </article>
  );
}
