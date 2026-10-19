// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../../../account/useUserTimeZone.hook.js';
import { GLOSSARY_TERM } from '../../../glossary/glossary.constant.js';
import { Term } from '../../../glossary/Term.component.js';
import { Icon } from '../../../layout/Icon.component.js';
import { useShownPrice } from '../../../live/useShownPrice.hook.js';
import { useRunDetailQuery, useTradesQuery } from '../../runs.query.js';
import { BALCONY_TEXT } from './balcony.constant.js';
import styles from './Plaques.module.css';
import { buildPlaques, type PlaqueView } from './plaque-model.js';
import { readCostRates } from './protection-math.js';

function Plaque({ plaque }: { readonly plaque: PlaqueView }): ReactElement {
  return (
    <li className={styles.plaque} data-tone={plaque.tone}>
      <p className={styles.head}>
        <Icon name={plaque.icon} size={16} />
        <span>{plaque.word}</span>
        <span className={styles.price}>{plaque.priceText}</span>
      </p>
      <p className={styles.percent}>
        {plaque.percent}{' '}
        <span className={styles.net}>
          <Term term={GLOSSARY_TERM.NET}>{BALCONY_TEXT.NET_WORD}</Term>
        </span>
      </p>
      <ul className={styles.lines}>
        {plaque.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </li>
  );
}

// As plaquinhas de compra e venda: a porcentagem líquida em destaque (já com taxa e deslizamento) e o USDT pequeno.
export function TradePlaques({ runId }: { readonly runId: string }): ReactElement | null {
  const timeZone = useUserTimeZone();
  const run = useRunDetailQuery(runId).data;
  const open = useTradesQuery(runId, { status: 'open' }).data?.pages[0]?.items[0];
  const closed = useTradesQuery(runId, { status: 'closed', order: 'desc' }).data?.pages[0]
    ?.items[0];
  const shown = useShownPrice(run?.symbol ?? '');
  if (run === undefined) return null;
  const plaques = buildPlaques({
    symbol: run.symbol,
    timeZone,
    costs: readCostRates(run.runParameters),
    openTrade: open,
    closedTrade: closed,
    currentPrice: shown?.price,
  });
  if (plaques.length === 0) return null;
  return (
    <section className={styles.section} aria-label={BALCONY_TEXT.PLAQUES_TITLE}>
      <h3 className={styles.title}>{BALCONY_TEXT.PLAQUES_TITLE}</h3>
      <ul className={styles.list}>
        {plaques.map((plaque) => (
          <Plaque key={plaque.key} plaque={plaque} />
        ))}
      </ul>
      <p className={styles.note}>{BALCONY_TEXT.PLAQUES_NOTE}</p>
    </section>
  );
}
