// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import runStyles from '../runs/Runs.module.css';
import { StrategyListCard } from './StrategyListCard.component.js';

export function StrategiesPage(): ReactElement {
  return (
    <div className={runStyles.page}>
      <h1 className={runStyles.title}>Estratégias</h1>
      <StrategyListCard />
    </div>
  );
}
