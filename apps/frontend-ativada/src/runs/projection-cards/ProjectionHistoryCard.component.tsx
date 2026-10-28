// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Term } from '../../glossary/Term.component.js';
import { Card } from '../../layout/Card.component.js';
import { Icon } from '../../layout/Icon.component.js';
import controls from '../../styles/Controls.module.css';
import { useProjectionsQuery } from '../candle-chart/candle-chart.query.js';
import { formatIntervalLimitPercent, formatRatePercent } from '../candle-chart/projection-text.js';
import type { ProjectionSummary } from '../candle-chart/projections.validation.js';
import styles from './ProjectionCards.module.css';
import { HITS_ANCHOR } from '../live-tracking/live-anchors.js';
import { ProjectionHistoryTable } from './ProjectionHistoryTable.component.js';
import { COIN_FLIP_PERCENT, VERDICT_LOOK } from './projection-verdict.js';
import { StrengthBars } from './StrengthBars.component.js';

export const HISTORY_TEXT = {
  TITLE: 'Histórico de acertos',
  LOADING: 'Carregando o histórico de acertos…',
  ERROR: 'Não foi possível carregar o histórico de acertos.',
  EMPTY: 'Ainda não há previsões com resultado.',
} as const;

function Kpi(props: {
  readonly label: ReactElement | string;
  readonly value: string;
  readonly sub: string;
}): ReactElement {
  return (
    <div className={styles.kpi}>
      <dt className={styles.kpiLabel}>{props.label}</dt>
      <dd className={styles.kpiValue}>{props.value}</dd>
      <dd className={styles.kpiSub}>{props.sub}</dd>
    </div>
  );
}

// "Acertou o lado 49,42% — 171 de 346" ao lado da moeda ao ar (50%) e do "sempre sobe", como o servidor contou.
function Kpis({ summary }: { readonly summary: ProjectionSummary }): ReactElement {
  return (
    <dl className={styles.kpis}>
      <Kpi
        label={<Term term="sideHitRate">Acertou o lado</Term>}
        value={formatRatePercent(summary.hitRate)}
        sub={`${summary.hits} de ${summary.counted} previsões`}
      />
      <Kpi
        label={<Term term="coinFlip">Moeda ao ar</Term>}
        value={COIN_FLIP_PERCENT}
        sub={`"sempre sobe": ${formatRatePercent(summary.upRate)}`}
      />
      <Kpi
        label="Dentro da faixa"
        value={formatRatePercent(summary.insideRate)}
        sub={`${summary.inside} de ${summary.banded} velas`}
      />
    </dl>
  );
}

function Verdict({ summary }: { readonly summary: ProjectionSummary }): ReactElement {
  const look = VERDICT_LOOK[summary.verdict];
  const interval = summary.wilson;
  return (
    <div className={`${styles.verdict} ${styles[look.tone] ?? ''}`}>
      <span className={styles.verdictWord}>
        <Icon name={look.icon} size={16} />
        {look.word}
      </span>
      <span>{summary.verdictMessage}</span>
      {interval === null || summary.verdict === 'too_few' ? null : (
        <span className={styles.muted}>
          Com 95% de confiança, o acerto verdadeiro está entre{' '}
          {formatIntervalLimitPercent(interval.lower, 'lower')} e{' '}
          {formatIntervalLimitPercent(interval.upper, 'upper')}.
        </span>
      )}
    </div>
  );
}

function SummaryBlock({ summary }: { readonly summary: ProjectionSummary }): ReactElement {
  return (
    <>
      <p className={styles.lead}>{summary.message}</p>
      <Kpis summary={summary} />
      <Verdict summary={summary} />
      <StrengthBars rows={summary.byStrength} />
    </>
  );
}

// "Histórico de acertos" da execução inteira (RF18 e RF19): números e frases do servidor, a moeda ao ar como referência e o
// veredito de Wilson. Abaixo de 30 previsões contadas o servidor diz que são poucas, e a tela repete isso.
export function ProjectionHistoryCard({ runId }: { readonly runId: string }): ReactElement {
  const query = useProjectionsQuery({ runId });
  const data = query.data;
  return (
    <Card id={HITS_ANCHOR} title={HISTORY_TEXT.TITLE} icon="check">
      {data === undefined ? (
        <p className={controls.muted} role="status">
          {query.isError ? HISTORY_TEXT.ERROR : HISTORY_TEXT.LOADING}
        </p>
      ) : (
        <>
          {data.summary === undefined ? (
            <p className={styles.lead}>{data.current.message}</p>
          ) : (
            <SummaryBlock summary={data.summary} />
          )}
          {data.items.length === 0 ? (
            <p className={controls.muted}>{HISTORY_TEXT.EMPTY}</p>
          ) : (
            <ProjectionHistoryTable runId={runId} timeframe={data.timeframe} />
          )}
        </>
      )}
    </Card>
  );
}
