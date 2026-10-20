// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement, ReactNode } from 'react';

import { useAppConfig } from '../../app/useAppContext.hook.js';
import type { LiveStatus } from '../live-tracking/live-status.validation.js';
import { FearGreedScreen } from './FearGreedScreen.component.js';
import { DecisionBoard } from './WallBoards.component.js';
import { WallClocks, WallHeatmap } from './WallScreens.component.js';
import { WallTicker } from './WallTicker.component.js';
import { CalmToggle } from './RoomParts.component.js';
import { TRADING_ROOM_TEXT } from './trading-room.constant.js';
import { useTradingRoomModel } from './useTradingRoomModel.hook.js';
import styles from './TradingRoom.module.css';

function RoomDecisionBoard({
  runId,
  status,
}: {
  readonly runId: string;
  readonly status: LiveStatus;
}): ReactElement {
  const model = useTradingRoomModel(runId, status);
  const leader = model.opinions.find((item) => item.kind === 'leader');
  return <DecisionBoard status={status} tradePlan={model.tradePlan} intent={leader?.intent} />;
}

export type RoomWallProps = {
  readonly runId: string;
  readonly screen: ReactNode;
  readonly status: LiveStatus | undefined;
  readonly isMoving: boolean;
};

// A parede: o telão no meio, a decisão da equipe e os quadros ao lado. O telão vem PRIMEIRO no DOM (ordem de foco: Calmo,
// telão, quadros); a grade põe cada um no lugar. O telão nunca troca de pai (o gráfico não recarrega).
export function RoomWall({ runId, screen, status, isMoving }: RoomWallProps): ReactElement {
  const symbols = useAppConfig().marketSymbols;
  return (
    <div className={styles.wall} data-motion={isMoving ? 'on' : undefined}>
      <div className={styles.screen}>{screen}</div>
      <div className={styles.right}>
        {status === undefined ? null : <RoomDecisionBoard runId={runId} status={status} />}
        <WallTicker symbols={symbols} />
        <WallHeatmap symbols={symbols} />
      </div>
      <div className={styles.roomHead}>
        <p className={styles.roomTitle} aria-hidden="true">
          {TRADING_ROOM_TEXT.TITLE}
        </p>
        <CalmToggle />
      </div>
      <div className={styles.left}>
        <FearGreedScreen />
        <WallClocks />
      </div>
    </div>
  );
}
