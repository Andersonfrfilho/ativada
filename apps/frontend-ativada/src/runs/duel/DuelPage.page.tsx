// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { ROUTE_PATH } from '../../app/app.constant.js';
import { ApiError } from '../../http/api.error.js';
import { formatSymbol } from '../../format/format.js';
import { GLOSSARY_TERM } from '../../glossary/glossary.constant.js';
import { Term } from '../../glossary/Term.component.js';
import { Card } from '../../layout/Card.component.js';
import controls from '../../styles/Controls.module.css';
import runStyles from '../Runs.module.css';
import { useDuelQuery } from './duel.query.js';
import { DuelChart } from './DuelChart.component.js';
import { DuelRanking } from './DuelRanking.component.js';
import { DUEL_TEXT } from './duel-text.js';
import styles from './Duel.module.css';

function Missing({ error }: { readonly error: unknown }): ReactElement {
  const isNotFound = error instanceof ApiError && error.status === 404;
  return (
    <p role="alert" className={controls.error}>
      {isNotFound ? DUEL_TEXT.NOT_FOUND : DUEL_TEXT.ERROR}
    </p>
  );
}

// `/duelo/:duelId` (RF21): o gráfico único de patrimônio e o ranking. Atualiza com o aviso do stream a cada vela nova.
export function DuelPage(): ReactElement {
  const { duelId = '' } = useParams();
  const query = useDuelQuery(duelId);
  const duel = query.data;
  return (
    <div className={runStyles.page}>
      <h1 className={runStyles.title}>
        <Term term={GLOSSARY_TERM.DUEL}>{DUEL_TEXT.TITLE}</Term>
      </h1>
      {query.isError ? <Missing error={query.error} /> : null}
      {duel === undefined ? (
        query.isError ? null : (
          <p className={controls.muted}>{DUEL_TEXT.LOADING}</p>
        )
      ) : (
        <div className={styles.page}>
          <p className={controls.muted}>
            {formatSymbol(duel.symbol)} · {duel.notice}
          </p>
          <Card title={DUEL_TEXT.CHART_TITLE} icon="backtests">
            <DuelChart duel={duel} />
          </Card>
          <Card title={DUEL_TEXT.RANKING_TITLE} icon="team">
            <DuelRanking duel={duel} />
            <p className={controls.muted}>{duel.comparisonNotice}</p>
            <p className={controls.muted}>{DUEL_TEXT.RETURN_NOTICE}</p>
          </Card>
          <Link className={styles.link} to={ROUTE_PATH.BACKTESTS}>
            Voltar às simulações
          </Link>
        </div>
      )}
    </div>
  );
}
