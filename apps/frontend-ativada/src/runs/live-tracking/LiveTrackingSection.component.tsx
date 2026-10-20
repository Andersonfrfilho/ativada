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
import { LiveSectionPlaceholder } from './LiveSectionPlaceholder.component.js';
import { LiveTrackingCard, TRACKING_ANCHOR } from './LiveTrackingCard.component.js';
import { DECISIONS_ANCHOR, TRIGGERS_ANCHOR } from './LiveTradesState.component.js';
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
      <div role="alert">
        <p className={controls.error}>
          Não foi possível carregar o acompanhamento. Tente novamente em instantes.
        </p>
        <button type="button" className={controls.button} onClick={() => void status.refetch()}>
          Tentar de novo
        </button>
      </div>
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

// Cartão "Acompanhamento" (a aba de mesmo nome).
export function LiveTrackingSection({ run }: LiveTrackingSectionProps): ReactElement {
  const query = useLiveStatusQuery(run.id, true);
  const status = query.data;
  if (status === undefined) {
    return (
      <LiveSectionPlaceholder
        id={TRACKING_ANCHOR}
        title="Acompanhamento"
        icon="activity"
        query={query}
      />
    );
  }
  return <LiveTrackingCard run={run} status={status} />;
}

// "O que falta para comprar agora" e a meta: uma aba própria na simulação ao vivo.
export function LiveTriggersSection({ run }: LiveTrackingSectionProps): ReactElement {
  const query = useLiveStatusQuery(run.id, true);
  const status = query.data;
  if (status === undefined) {
    return (
      <LiveSectionPlaceholder id={TRIGGERS_ANCHOR} title="O que falta" icon="flag" query={query} />
    );
  }
  return (
    <div className={status.goal === null ? styles.stack : styles.grid}>
      <NextTriggersBlock status={status} />
      <LiveGoalBlock status={status} goalId={run.goalId} />
    </div>
  );
}

// A tabela "O que a estratégia decidiu", logo depois do gráfico (mesma consulta do topo: o aviso do stream refaz as duas).
export function LiveDecisionsSection({ run }: LiveTrackingSectionProps): ReactElement {
  const query = useLiveStatusQuery(run.id, true);
  if (query.data === undefined) {
    return (
      <LiveSectionPlaceholder
        id={DECISIONS_ANCHOR}
        title="O que a estratégia decidiu"
        icon="list"
        query={query}
      />
    );
  }
  return <DecisionsTable runId={run.id} status={query.data} />;
}
