// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import {
  isSimulationTimeframe,
  SIMULATION_TIMEFRAME_LABEL,
} from '../../goals/simulation-timeframe.constant.js';
import { Icon, type IconName } from '../../layout/Icon.component.js';
import { deriveLiveRunState } from '../live-run-status.js';
import type { RunDetail } from '../run.validation.js';
import { useTradeSummaryQuery } from '../trade-chart.query.js';
import { TradeSummary } from '../TradeSummary.component.js';
import type { LiveStatus } from './live-status.validation.js';
import styles from './LiveTracking.module.css';

export const DECISIONS_ANCHOR = 'decisoes';
export const TRIGGERS_ANCHOR = 'falta';

const NO_BUY_TITLE = 'Nenhuma compra ainda: a estratégia está esperando';
const PENDING_BUY_TITLE = 'Compra pedida: executa na abertura da próxima vela';

type EmptyStateProps = {
  readonly icon: IconName;
  readonly title: string;
  readonly children: string;
  readonly hasLinks: boolean;
};

function EmptyState({ icon, title, children, hasLinks }: EmptyStateProps): ReactElement {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon}>
        <Icon name={icon} />
      </span>
      <div>
        <h3 className={styles.emptyTitle}>{title}</h3>
        <p className={styles.emptyText}>
          {children}
          {hasLinks ? (
            <>
              {' '}
              <a href={`#${DECISIONS_ANCHOR}`}>Ver o que ela analisou em cada vela</a> ·{' '}
              <a href={`#${TRIGGERS_ANCHOR}`}>o que falta para comprar</a>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

function describeAnalysis(status: LiveStatus): string {
  const { items, nextCursor } = status.decisions;
  const candle = isSimulationTimeframe(status.run.timeframe)
    ? `velas de ${SIMULATION_TIMEFRAME_LABEL[status.run.timeframe]}`
    : 'velas';
  const scope = nextCursor === null ? `Em ${items.length}` : `Nas últimas ${items.length}`;
  const verdict = items.every((item) => item.outcome === 'waited')
    ? 'decidiu esperar em todas'
    : 'registrou cada decisão';
  return `${scope} ${candle} ela analisou o mercado e ${verdict}. Os totais de compras e vendas aparecem aqui na primeira operação.`;
}

type LiveTradesStateProps = { readonly run: RunDetail; readonly status: LiveStatus };

// RF09: no lugar dos zeros do resumo, diz por que não há compra; com operações, o resumo de sempre.
export function LiveTradesState({ run, status }: LiveTradesStateProps): ReactElement | null {
  const timeZone = useUserTimeZone();
  const summary = useTradeSummaryQuery(run.id).data;
  if (status.decisions.items.length === 0) {
    const state = deriveLiveRunState(run, { now: Date.now(), timeZone });
    const text = state.kind === 'waitingFirstCandle' ? state.text : 'Ainda sem vela fechada.';
    return (
      <EmptyState icon="pause" title="Aguardando a primeira vela" hasLinks={false}>
        {text}
      </EmptyState>
    );
  }
  if (summary === undefined) return null;
  if (summary.closedTrades + summary.openTrades > 0) return <TradeSummary runId={run.id} />;
  const hasPendingBuy = status.decisions.items[0]?.outcome === 'buy_pending';
  return (
    <EmptyState icon="pause" title={hasPendingBuy ? PENDING_BUY_TITLE : NO_BUY_TITLE} hasLinks>
      {describeAnalysis(status)}
    </EmptyState>
  );
}
