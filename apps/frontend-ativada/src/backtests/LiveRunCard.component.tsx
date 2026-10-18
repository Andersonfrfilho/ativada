// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { formatSymbol } from '../format/format.js';
import { Card } from '../layout/Card.component.js';
import { useActiveRunQuery } from '../overview/overview.query.js';
import type { Run } from '../overview/overview.validation.js';
import { LivePulseLine } from '../runs/live-tracking/LivePulseLine.component.js';
import { teamRunLabel } from '../runs/model-teams/run-source-label.js';
import { TRACKING_ANCHOR } from '../runs/live-tracking/LiveTrackingCard.component.js';
import { useRunDetailQuery } from '../runs/runs.query.js';
import { useVersionIndexQuery } from '../strategies/strategy.query.js';
import { describeLookup, lookupVersion } from '../strategies/version-index.js';
import styles from './BacktestGroups.module.css';

function LiveRunBody({ run }: { readonly run: Run }): ReactElement {
  const detail = useRunDetailQuery(run.id).data;
  const index = useVersionIndexQuery();
  const strategy =
    detail === undefined
      ? ''
      : ` · ${teamRunLabel(detail.signalSource) ?? describeLookup(lookupVersion(index, detail.strategyVersionId))}`;
  return (
    <Card title="Simulação ao vivo" icon="activity">
      <div className={styles.liveRow}>
        <strong>
          {formatSymbol(run.symbol)}
          {strategy}
        </strong>
        <Link
          to={{ pathname: `/backtests/${run.id}`, hash: `#${TRACKING_ANCHOR}` }}
          className={styles.pairLink}
        >
          Acompanhar
        </Link>
      </div>
      <LivePulseLine runId={run.id} symbol={run.symbol} />
    </Card>
  );
}

// No topo de Backtests: a simulação que está rodando agora, com a linha de pulso e o caminho para o acompanhamento.
export function LiveRunCard(): ReactElement | null {
  const run = useActiveRunQuery().data;
  return run === null || run === undefined ? null : <LiveRunBody run={run} />;
}
