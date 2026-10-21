// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import controls from '../styles/Controls.module.css';
import { LiveRunStatus } from './LiveRunStatus.component.js';
import { useRunDetailQuery } from './runs.query.js';

export type EmptyChartNoticeProps = { readonly runId: string };

// A execução ainda não tem nenhuma vela: na simulação ao vivo é a espera da primeira que fecha, com a hora dela.
export function EmptyChartNotice({ runId }: EmptyChartNoticeProps): ReactElement {
  const run = useRunDetailQuery(runId);
  return (
    <div role="status">
      <p className={controls.muted}>
        A simulação ainda não processou nenhuma vela; as velas abaixo são só o contexto de antes do
        início.
      </p>
      {run.data === undefined ? null : <LiveRunStatus run={run.data} />}
    </div>
  );
}
