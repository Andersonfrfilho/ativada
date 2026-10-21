// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import { Card } from '../layout/Card.component.js';
import { Icon } from '../layout/Icon.component.js';
import { useClock } from '../live/useClock.hook.js';
import { describeVerdict } from '../runs/live-tracking/LiveBalanceBlock.component.js';
import { useLiveStatusQuery } from '../runs/live-tracking/live-status.query.js';
import { TRACKING_ANCHOR } from '../runs/live-tracking/LiveTrackingCard.component.js';
import liveStyles from '../runs/live-tracking/LiveTracking.module.css';
import { CHIP_TONE, StatusChip } from '../runs/live-tracking/StatusChip.component.js';
import { LiveRunStatus } from '../runs/LiveRunStatus.component.js';
import type { RunDetail } from '../runs/run.validation.js';
import { useTradeSummaryQuery } from '../runs/trade-chart.query.js';
import controls from '../styles/Controls.module.css';
import { BalanceChart } from './BalanceChart.component.js';
import { BalanceHero } from './BalanceHero.component.js';
import { ComparisonBars } from './ComparisonBars.component.js';
import { RUN_STATUS } from './overview.constant.js';
import type { EquityPoint, Signal } from './overview.validation.js';
import { formatRunningFor } from './running-for.js';

const CLOCK_MILLISECONDS = 60_000;

export type BalanceCardProps = {
  readonly run: RunDetail;
  readonly points: readonly EquityPoint[];
  readonly signals?: readonly Signal[];
};

// A parada vem do servidor e vale sobre o resto: o selo não diz "Rodando" logo acima da faixa "Parada.".
function RunStateChip({ run }: { readonly run: RunDetail }): ReactElement {
  const now = useClock(CLOCK_MILLISECONDS);
  if (run.stalledSince !== undefined) {
    return (
      <StatusChip tone={CHIP_TONE.WARN} icon="alert">
        Parada
      </StatusChip>
    );
  }
  if (run.status !== RUN_STATUS.RUNNING) return <StatusChip icon="pause">Na fila</StatusChip>;
  return (
    <StatusChip tone={CHIP_TONE.BUY} icon="activity">
      {`Rodando há ${formatRunningFor(now - run.periodStart)}`}
    </StatusChip>
  );
}

function BalanceVerdict({ runId }: { readonly runId: string }): ReactElement | null {
  const status = useLiveStatusQuery(runId, true).data;
  const verdict = status === undefined ? undefined : describeVerdict(status);
  if (verdict === undefined) return null;
  return (
    <div className={liveStyles.verdict}>
      <Icon name="info" />
      <span>{verdict}</span>
    </div>
  );
}

function BalanceFooter({
  run,
  count,
}: {
  readonly run: RunDetail;
  readonly count: number;
}): ReactElement {
  return (
    <div className={liveStyles.cardFoot}>
      <span className={controls.muted}>Dinheiro fictício · {count} velas fechadas</span>
      <Link
        to={{ pathname: `${ROUTE_PATH.BACKTESTS}/${run.id}`, hash: `#${TRACKING_ANCHOR}` }}
        className={liveStyles.link}
      >
        Ver o acompanhamento completo
      </Link>
      <Link to={`${ROUTE_PATH.BACKTESTS}/${run.id}`} className={liveStyles.link}>
        Ver compras e vendas no gráfico
      </Link>
    </div>
  );
}

export function BalanceCard({ run, points, signals }: BalanceCardProps): ReactElement {
  const latest = points.at(-1);
  const status = useLiveStatusQuery(run.id, true).data;
  const summary = useTradeSummaryQuery(run.id).data;
  const hasTrades =
    summary === undefined ? undefined : summary.closedTrades + summary.openTrades > 0;
  const initial = run.survival?.initialBalance;
  return (
    <Card title="Sua simulação ao vivo" icon="activity" aside={<RunStateChip run={run} />}>
      <LiveRunStatus run={run} />
      {latest === undefined ? (
        <p className={controls.muted}>O saldo aparece quando a primeira vela fechar.</p>
      ) : (
        <>
          <BalanceHero run={run} equity={latest.equity} status={status} hasTrades={hasTrades} />
          {initial === undefined ? null : (
            <ComparisonBars initial={initial} equity={latest.equity} benchmark={latest.benchmark} />
          )}
          <BalanceVerdict runId={run.id} />
          <BalanceChart
            points={points}
            timeframe={run.timeframe}
            {...(signals === undefined ? {} : { signals })}
          />
        </>
      )}
      <BalanceFooter run={run} count={points.length} />
    </Card>
  );
}
