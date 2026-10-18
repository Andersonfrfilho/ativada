// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement } from 'react';

import { Term } from '../glossary/Term.component.js';
import { GLOSSARY_TERM } from '../glossary/glossary.constant.js';
import { isRateLimitError } from '../http/rate-limit.js';
import { Card } from '../layout/Card.component.js';
import { useClock } from '../live/useClock.hook.js';
import { RateLimitNotice } from '../runs/RateLimitNotice.component.js';
import controls from '../styles/Controls.module.css';
import { LiveSimulationCard } from './LiveSimulationCard.component.js';
import { LiveSimulationsToolbar } from './LiveSimulationsToolbar.component.js';
import { LiveSimulationsTotal } from './LiveSimulationsTotal.component.js';
import styles from './LiveSimulations.module.css';
import {
  arrangeSimulations,
  SORT_KEY,
  symbolsOf,
  totalOf,
  type SortKey,
} from './live-simulations.js';
import type { FeaturedRun } from './useFeaturedRun.hook.js';
import type { LiveSimulations } from './useLiveSimulations.hook.js';

const CLOCK_MILLISECONDS = 60_000;

function SummaryProblem({ summary }: Pick<LiveSimulations, 'summary'>): ReactElement | null {
  // Com o 429 a consulta repete sozinha por um tempo: a tela já diz o porquê, sem esperar a última tentativa.
  if (summary.data === undefined && isRateLimitError(summary.error ?? summary.failureReason)) {
    return <RateLimitNotice retryAt={undefined} onRetry={() => void summary.refetch()} />;
  }
  if (!summary.isError) return null;
  return (
    <p role="alert" className={controls.error}>
      Não foi possível carregar o saldo das simulações. Elas aparecem abaixo sem os números.
    </p>
  );
}

function Legend(): ReactElement {
  return (
    <p className={styles.muted}>
      Cada cartão é uma simulação ao vivo, com dinheiro de mentira. Compare com{' '}
      <Term term={GLOSSARY_TERM.BUY_AND_HOLD}>comprar e segurar</Term> e veja a{' '}
      <Term term={GLOSSARY_TERM.CANDLE}>vela</Term> usada. O{' '}
      <Term term={GLOSSARY_TERM.ANALYST}>analista</Term> só aparece nas que o escolheram.
    </p>
  );
}

export type LiveSimulationsPanelProps = LiveSimulations & {
  // Sem `select` (página Ao vivo) o cartão não oferece o botão de destaque da Visão geral.
  readonly select?: FeaturedRun['select'] | undefined;
  readonly featuredId: string | undefined;
};

// Todas as simulações ao vivo lado a lado: a Visão geral não esconde nenhuma atrás da "primeira".
export function LiveSimulationsPanel(props: LiveSimulationsPanelProps): ReactElement {
  const now = useClock(CLOCK_MILLISECONDS);
  const [sort, setSort] = useState<SortKey>(SORT_KEY.RECENT);
  const [symbol, setSymbol] = useState<string | undefined>(undefined);
  const shown = arrangeSimulations(props.simulations, { sort, symbol });
  return (
    <Card title="Minhas simulações ao vivo" icon="activity">
      <Legend />
      <LiveSimulationsTotal total={totalOf(props.simulations)} />
      <SummaryProblem summary={props.summary} />
      <LiveSimulationsToolbar
        sort={sort}
        symbol={symbol}
        symbols={symbolsOf(props.simulations)}
        onSort={setSort}
        onSymbol={setSymbol}
      />
      <ul className={styles.list} aria-label="Simulações ao vivo">
        {shown.map((simulation) => (
          <LiveSimulationCard
            key={simulation.run.id}
            simulation={simulation}
            now={now}
            isFeatured={simulation.run.id === props.featuredId}
            onFeature={props.select}
          />
        ))}
      </ul>
    </Card>
  );
}
