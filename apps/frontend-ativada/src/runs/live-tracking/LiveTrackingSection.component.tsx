// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { isRateLimitError } from '../../http/rate-limit.js';
import { RateLimitNotice } from '../RateLimitNotice.component.js';
import type { RunDetail } from '../run.validation.js';
import controls from '../../styles/Controls.module.css';
import { DecisionsTable } from './DecisionsTable.component.js';
import { LiveGoalBlock } from './LiveGoalBlock.component.js';
import { LivePulseLine } from './LivePulseLine.component.js';
import { LiveSummaryStrip } from './LiveSummaryStrip.component.js';
import { LiveTrackingCard } from './LiveTrackingCard.component.js';
import styles from './LiveTracking.module.css';
import { useLiveStatusQuery } from './live-status.query.js';
import { NextTriggersBlock } from './NextTriggersBlock.component.js';
import { StaleDataNotice } from './StaleDataNotice.component.js';

export type LiveTrackingSectionProps = { readonly run: RunDetail };

// Linha de pulso e o resumo curto "Sua simulação ao vivo": o topo do detalhe da simulação ao vivo, antes do gráfico.
export function LiveSummarySection({ run }: LiveTrackingSectionProps): ReactElement {
  const status = useLiveStatusQuery(run.id, true);
  if (status.data === undefined && isRateLimitError(status.error ?? status.failureReason)) {
    return <RateLimitNotice retryAt={undefined} onRetry={() => void status.refetch()} />;
  }
  if (status.data === undefined && status.isError) {
    return (
      <p role="alert" className={controls.error}>
        Não foi possível carregar o acompanhamento. Tente novamente em instantes.
      </p>
    );
  }
  if (status.data === undefined) return <p role="status">Carregando o acompanhamento…</p>;
  return (
    <>
      {status.isError ? <StaleDataNotice updatedAt={status.dataUpdatedAt} /> : null}
      <LivePulseLine runId={run.id} symbol={run.symbol} />
      <LiveSummaryStrip status={status.data} />
    </>
  );
}

// Cartão "Acompanhamento", o que falta para comprar e a meta: o detalhe, depois do gráfico e das decisões.
export function LiveTrackingSection({ run }: LiveTrackingSectionProps): ReactElement | null {
  const status = useLiveStatusQuery(run.id, true).data;
  if (status === undefined) return null;
  return (
    <>
      <LiveTrackingCard run={run} status={status} />
      <div className={status.goal === null ? styles.stack : styles.grid}>
        <NextTriggersBlock status={status} />
        <LiveGoalBlock status={status} goalId={run.goalId} />
      </div>
    </>
  );
}

// A tabela "O que a estratégia decidiu", logo depois do gráfico (mesma consulta do topo: o aviso do stream refaz as duas).
export function LiveDecisionsSection({ run }: LiveTrackingSectionProps): ReactElement | null {
  const status = useLiveStatusQuery(run.id, true).data;
  return status === undefined ? null : <DecisionsTable runId={run.id} status={status} />;
}
