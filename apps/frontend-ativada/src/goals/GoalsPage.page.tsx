// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import runStyles from '../runs/Runs.module.css';
import { GoalListCard } from './GoalListCard.component.js';
import { NewGoalCard } from './NewGoalCard.component.js';

export function GoalsPage(): ReactElement {
  return (
    <div className={runStyles.page}>
      <h1 className={runStyles.title}>Metas</h1>
      <NewGoalCard />
      <GoalListCard />
    </div>
  );
}
