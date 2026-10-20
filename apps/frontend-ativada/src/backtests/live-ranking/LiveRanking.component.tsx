// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { ROUTE_PATH } from '../../app/app.constant.js';
import { Icon, type IconName } from '../../layout/Icon.component.js';
import { MEDAL_WORD, TONE_WORD, type RankingEntry } from './live-ranking.js';
import styles from './LiveRanking.module.css';
import { useLiveRanking } from './useLiveRanking.hook.js';

const TONE_ICON: Readonly<Record<RankingEntry['tone'], IconName>> = {
  up: 'arrowUp',
  down: 'arrowDown',
  flat: 'equal',
};

function chipClass(entry: RankingEntry): string {
  const tone = styles[entry.tone] ?? '';
  return entry.isCurrent ? `${styles.chip} ${tone} ${styles.current}` : `${styles.chip} ${tone}`;
}

function RankingChip({ entry }: { readonly entry: RankingEntry }): ReactElement {
  const medalClass = entry.medal === undefined ? '' : (styles[entry.medal] ?? '');
  const medalWord = entry.medal === undefined ? undefined : MEDAL_WORD[entry.medal];
  return (
    <li className={styles.item}>
      <Link
        to={`${ROUTE_PATH.BACKTESTS}/${entry.runId}`}
        className={chipClass(entry)}
        aria-current={entry.isCurrent ? 'true' : undefined}
      >
        <span className={`${styles.position} ${medalClass}`}>{entry.position}º</span>
        {medalWord === undefined ? null : <span className={styles.medalWord}>{medalWord}</span>}
        <span className={styles.label}>{entry.label}</span>
        <span className={styles.result}>
          <Icon name={TONE_ICON[entry.tone]} size={14} />
          {entry.rateText}
        </span>
        <span className={styles.word}>{TONE_WORD[entry.tone]}</span>
      </Link>
    </li>
  );
}

// O ranking das simulações ao vivo rodando: melhor resultado primeiro, a execução aberta marcada; o link troca de execução.
export function LiveRanking({ currentId }: { readonly currentId: string }): ReactElement | null {
  const ranking = useLiveRanking(currentId);
  if (ranking.length === 0) return null;
  return (
    <section className={styles.ranking} aria-labelledby="live-ranking-title">
      <div className={styles.header}>
        <h2 id="live-ranking-title" className={styles.title}>
          Ranking ao vivo
        </h2>
        <span className={styles.note}>resultado desde o início, dinheiro fictício</span>
      </div>
      <ol className={styles.row} aria-label="Ranking ao vivo">
        {ranking.map((entry) => (
          <RankingChip key={entry.runId} entry={entry} />
        ))}
      </ol>
    </section>
  );
}
