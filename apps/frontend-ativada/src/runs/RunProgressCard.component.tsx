// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import { RUN_STATUS, statusLabel } from './run.constant.js';
import styles from './Runs.module.css';
import { useStopRunMutation } from './runs.query.js';
import type { RunDetail } from './run.validation.js';

export type RunProgressCardProps = { readonly run: RunDetail };

export function RunProgressCard({ run }: RunProgressCardProps): ReactElement {
  const stop = useStopRunMutation(run.id);
  const position = run.queuePosition;
  return (
    <Card title="Andamento">
      <p className={styles.sub}>{statusLabel(run.status)}</p>
      {run.status === RUN_STATUS.QUEUED && position !== null ? (
        <p>
          Posição na fila: {position.own} (de {position.overall} na fila geral)
        </p>
      ) : null}
      <progress
        className={styles.progress}
        aria-label="Progresso da execução"
        aria-valuenow={run.progress}
        value={run.progress}
        max={100}
      />
      <button
        type="button"
        className={controls.button}
        disabled={stop.isPending}
        onClick={() => stop.mutate()}
      >
        Cancelar execução
      </button>
    </Card>
  );
}
