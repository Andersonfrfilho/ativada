// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { LiveGoalBlock } from '../runs/live-tracking/LiveGoalBlock.component.js';
import { useLiveStatusQuery } from '../runs/live-tracking/live-status.query.js';
import controls from '../styles/Controls.module.css';
import { useGoalRunQuery } from './goal-run.query.js';

function ActiveGoal({
  runId,
  goalId,
}: {
  readonly runId: string;
  readonly goalId: string;
}): ReactElement {
  const status = useLiveStatusQuery(runId, true);
  if (status.isError) {
    return (
      <p role="alert" className={controls.error}>
        Não foi possível carregar a meta. Tente novamente em instantes.
      </p>
    );
  }
  if (status.data === undefined) return <p role="status">Carregando a meta…</p>;
  return <LiveGoalBlock status={status.data} goalId={goalId} />;
}

// A meta da simulação com os números do servidor (um cálculo só, em decimal): alvo, prazo, ganho, perda e ritmo.
export function ActiveGoalCard(): ReactElement | null {
  const run = useGoalRunQuery().data;
  if (run === null || run === undefined) return null;
  if (run.goalId === null || run.goalId === undefined) return null;
  return <ActiveGoal runId={run.id} goalId={run.goalId} />;
}
