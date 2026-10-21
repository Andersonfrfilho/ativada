// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatDecimalText } from '../../format/decimal.js';
import { useLiveStatusQuery } from '../live-tracking/live-status.query.js';
import { LivePulseLine } from '../live-tracking/LivePulseLine.component.js';
import { formatRate } from '../trading-room/room-plan-rows.js';
import styles from './LiveTabs.module.css';

const MONEY = { minimumFraction: 2, maximumFraction: 2 } as const;

// Uma linha só acima do telão: "Rodando · preço · última decisão · próxima" e o saldo com o resultado do servidor.
export function RunTopLine({
  runId,
  symbol,
}: {
  readonly runId: string;
  readonly symbol: string;
}): ReactElement {
  const balance = useLiveStatusQuery(runId, true).data?.balance;
  return (
    <div className={styles.topLine}>
      <span className={styles.liveChip}>Ao vivo</span>
      <LivePulseLine runId={runId} symbol={symbol} />
      {balance === undefined ? null : (
        <p className={styles.balance}>
          Saldo <strong>{formatDecimalText(balance.current, MONEY)} USDT fict.</strong> · Resultado{' '}
          <strong>{formatRate(balance.resultRate)}</strong>
        </p>
      )}
    </div>
  );
}
