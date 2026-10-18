// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatDate, formatSymbol } from '../format/format.js';
import { shortHash } from '../strategies/strategy.validation.js';
import { describeLookup, lookupVersion } from '../strategies/version-index.js';
import { useVersionIndexQuery } from '../strategies/strategy.query.js';
import { LiveBadge } from '../wayfinding/LiveBadge.component.js';
import { teamRunLabel, TEAM_RUN_NOTE } from './model-teams/run-source-label.js';
import { RUN_KIND, statusLabel } from './run.constant.js';
import styles from './Runs.module.css';
import type { Run } from './run.validation.js';

const KIND_LABEL: Readonly<Record<string, string>> = {
  [RUN_KIND.BACKTEST]: 'Backtest',
  [RUN_KIND.WALK_FORWARD]: 'Walk-forward',
  [RUN_KIND.LIVE_PAPER]: 'Simulação ao vivo',
};

export type RunHeaderProps = { readonly run: Run };

export function RunHeader({ run }: RunHeaderProps): ReactElement {
  const index = useVersionIndexQuery();
  const lookup = lookupVersion(index, run.strategyVersionId);
  const teamLabel = teamRunLabel(run.signalSource);
  return (
    <header>
      {run.kind === RUN_KIND.LIVE_PAPER ? <LiveBadge /> : null}
      <h1 className={styles.title}>
        {KIND_LABEL[run.kind] ?? run.kind}: {formatSymbol(run.symbol)} · {run.timeframe}
      </h1>
      <p className={styles.sub}>
        {run.periodEnd === null
          ? `desde ${formatDate(run.periodStart)}`
          : `${formatDate(run.periodStart)} a ${formatDate(run.periodEnd)}`}{' '}
        · {statusLabel(run.status)}
      </p>
      <p className={styles.sub}>
        {teamLabel ?? describeLookup(lookup)}
        {teamLabel === undefined && lookup.kind === 'found' ? (
          <span className={styles.num}> · {shortHash(lookup.label.configHash)}</span>
        ) : null}
      </p>
      {teamLabel === undefined ? null : <p className={styles.sub}>{TEAM_RUN_NOTE}</p>}
    </header>
  );
}
