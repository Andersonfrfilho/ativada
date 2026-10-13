// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Card } from '../layout/Card.component.js';
import { HistoryNote } from '../layout/HistoryNote.component.js';
import runStyles from '../runs/Runs.module.css';
import controls from '../styles/Controls.module.css';
import { useHorizonsQuery } from './horizon.query.js';
import { HorizonFilters } from './HorizonFilters.component.js';
import { useHorizonFilters } from './useHorizonFilters.hook.js';

export function HorizonsPage(): ReactElement {
  const filters = useHorizonFilters();
  const horizons = useHorizonsQuery({ symbol: filters.symbol, strategyId: filters.strategyId });
  return (
    <div className={runStyles.page}>
      <h1 className={runStyles.title}>Prazos</h1>
      <p className={controls.muted}>
        Compara, no histórico, em quanto tempo vale a pena ficar com uma moeda.
      </p>
      <HistoryNote />
      <Card title="Moeda e estratégia">
        <HorizonFilters filters={filters} />
      </Card>
      {horizons.isError ? (
        <p role="alert" className={controls.error}>
          Não foi possível carregar os prazos. Tente novamente em instantes.
        </p>
      ) : null}
      {horizons.isPending ? <p role="status">Calculando o histórico…</p> : null}
      {horizons.data === undefined ? null : <p>{horizons.data.recommendationMessage}</p>}
    </div>
  );
}
