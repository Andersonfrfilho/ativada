// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import type { RunDetail } from '../run.validation.js';
import controls from '../../styles/Controls.module.css';
import { DecisionsTable } from './DecisionsTable.component.js';
import { LiveGoalBlock } from './LiveGoalBlock.component.js';
import { LivePulseLine } from './LivePulseLine.component.js';
import { LiveTrackingCard } from './LiveTrackingCard.component.js';
import styles from './LiveTracking.module.css';
import { useLiveStatusQuery } from './live-status.query.js';

export type LiveTrackingSectionProps = { readonly run: RunDetail };

// Linha de pulso, cartão "Acompanhamento", o que falta para comprar e a meta: o topo do detalhe da simulação ao vivo.
export function LiveTrackingSection({ run }: LiveTrackingSectionProps): ReactElement {
  const status = useLiveStatusQuery(run.id, true);
  if (status.isError) {
    return (
      <p role="alert" className={controls.error}>
        Não foi possível carregar o acompanhamento. Tente novamente em instantes.
      </p>
    );
  }
  if (status.data === undefined) return <p role="status">Carregando o acompanhamento…</p>;
  return (
    <>
      <LivePulseLine runId={run.id} symbol={run.symbol} />
      <LiveTrackingCard run={run} status={status.data} />
      <div className={status.data.goal === null ? styles.stack : styles.grid}>
        <LiveGoalBlock status={status.data} goalId={run.goalId} />
      </div>
    </>
  );
}

// A tabela "O que a estratégia decidiu", depois do gráfico (mesma consulta do topo: o aviso do stream refaz as duas).
export function LiveDecisionsSection({ run }: LiveTrackingSectionProps): ReactElement | null {
  const status = useLiveStatusQuery(run.id, true).data;
  return status === undefined ? null : <DecisionsTable runId={run.id} status={status} />;
}
