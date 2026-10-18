// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import { DuelCreateCard } from '../runs/duel/DuelCreateCard.component.js';
import runStyles from '../runs/Runs.module.css';
import controls from '../styles/Controls.module.css';
import styles from './Backtests.module.css';
import { FilteredRunLists } from './FilteredRunLists.component.js';
import { LiveRunCard } from './LiveRunCard.component.js';
import { NewBacktestCard } from './NewBacktestCard.component.js';
import { RunFilterBar } from './RunFilterBar.component.js';
import { useRunFilters } from './useRunFilters.hook.js';

const MAX_COMPARED = 2;

export function BacktestsPage(): ReactElement {
  const [selected, setSelected] = useState<readonly string[]>([]);
  const filters = useRunFilters();

  function handleToggle(runId: string): void {
    setSelected((current) =>
      current.includes(runId)
        ? current.filter((id) => id !== runId)
        : [...current, runId].slice(0, MAX_COMPARED),
    );
  }

  const [first, second] = selected;
  return (
    <div className={runStyles.page}>
      <h1 className={runStyles.title}>Backtests</h1>
      <LiveRunCard />
      <NewBacktestCard />
      <DuelCreateCard />
      <div className={styles.compareBar}>
        {first !== undefined && second !== undefined ? (
          <Link to={`${ROUTE_PATH.BACKTEST_COMPARE}?a=${first}&b=${second}`}>
            Comparar as {selected.length} selecionadas
          </Link>
        ) : (
          <p className={controls.muted}>
            Marque duas execuções concluídas para compará-las lado a lado.
          </p>
        )}
      </div>
      <RunFilterBar filters={filters} />
      <FilteredRunLists filters={filters} selection={{ selected, onToggle: handleToggle }} />
    </div>
  );
}
