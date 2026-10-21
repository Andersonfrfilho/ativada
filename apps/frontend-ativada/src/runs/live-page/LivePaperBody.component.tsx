// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { AnalystSection } from '../analyst/AnalystSection.component.js';
import {
  LiveDecisionsSection,
  LiveSummarySection,
  LiveTrackingSection,
  LiveTriggersSection,
} from '../live-tracking/LiveTrackingSection.component.js';
import { TeamComparison } from '../model-teams/TeamComparison.component.js';
import { ProjectionCards } from '../projection-cards/ProjectionCards.component.js';
import { RunHeader } from '../RunHeader.component.js';
import { RunProgressCard } from '../RunProgressCard.component.js';
import { RUN_STATUS } from '../run.constant.js';
import { isActiveRun, type RunDetail } from '../run.validation.js';
import { LiveChartArea } from '../team-room/LiveChartArea.component.js';
import { TradeOperations } from '../TradeOperations.component.js';
import { LIVE_TAB } from './live-tabs.js';
import { LiveTabs } from './LiveTabs.component.js';
import { RunTopLine } from './RunTopLine.component.js';

export type LivePaperBodyProps = {
  readonly run: RunDetail;
  // O detalhe de um backtest concluído (a simulação ao vivo que terminou também tem um).
  readonly completed: ReactElement | null;
  readonly cancelled: ReactElement | null;
};

function Tracking({ run, completed, cancelled }: LivePaperBodyProps): ReactElement {
  return (
    <>
      <RunHeader run={run} />
      {cancelled}
      <LiveSummarySection run={run} />
      <LiveTrackingSection run={run} />
      {completed}
      {isActiveRun(run) ? <RunProgressCard run={run} /> : null}
    </>
  );
}

// A simulação ao vivo: uma linha de estado, a sala de operações (telão, parede, piso, decisão e opiniões) e, abaixo, as abas.
export function LivePaperBody(props: LivePaperBodyProps): ReactElement {
  const { run } = props;
  const hasChart = run.status === RUN_STATUS.RUNNING || run.status === RUN_STATUS.CANCELLED;
  const panels = {
    [LIVE_TAB.OPERATIONS]: hasChart ? <TradeOperations runId={run.id} /> : null,
    [LIVE_TAB.DECISIONS]: (
      <>
        <LiveDecisionsSection run={run} />
        <AnalystSection runId={run.id} />
      </>
    ),
    [LIVE_TAB.TRIGGERS]: <LiveTriggersSection run={run} />,
    [LIVE_TAB.HITS]: (
      <>
        {hasChart ? <ProjectionCards runId={run.id} isLive /> : null}
        <TeamComparison runId={run.id} />
      </>
    ),
    [LIVE_TAB.TRACKING]: <Tracking {...props} />,
  };
  return (
    <>
      <RunTopLine runId={run.id} symbol={run.symbol} />
      <LiveChartArea
        runId={run.id}
        symbol={run.symbol}
        timeframe={run.timeframe}
        hasChart={hasChart}
      />
      <LiveTabs panels={panels} />
    </>
  );
}
