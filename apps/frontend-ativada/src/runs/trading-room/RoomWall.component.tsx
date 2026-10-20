// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement, ReactNode } from 'react';

import { useAppConfig } from '../../app/useAppContext.hook.js';
import type { LiveStatus } from '../live-tracking/live-status.validation.js';
import { FearGreedScreen } from './FearGreedScreen.component.js';
import { useTradePlanQuery } from './trade-plan.query.js';
import { NextCandleBoard, PriceBoard } from './WallBoards.component.js';
import { WallClocks, WallHeatmap } from './WallScreens.component.js';
import { WallTicker } from './WallTicker.component.js';
import { CalmToggle } from './RoomParts.component.js';
import { TRADING_ROOM_TEXT } from './trading-room.constant.js';
import styles from './TradingRoom.module.css';

export type RoomWallProps = {
  readonly runId: string;
  readonly screen: ReactNode;
  readonly status: LiveStatus | undefined;
  readonly isMoving: boolean;
  // A decisão da equipe, colada embaixo do telão.
  readonly decision: ReactNode;
};

// A parede: o telão no meio com a decisão embaixo, os quadros dos lados. O telão vem PRIMEIRO no DOM (ordem de foco: Calmo,
// telão, quadros); a grade põe cada um no lugar. O telão nunca troca de pai (o gráfico não recarrega).
export function RoomWall({
  runId,
  screen,
  status,
  isMoving,
  decision,
}: RoomWallProps): ReactElement {
  const symbols = useAppConfig().marketSymbols;
  const tradePlan = useTradePlanQuery(runId, true).data;
  return (
    <div className={styles.wall} data-motion={isMoving ? 'on' : undefined}>
      <div className={styles.screen}>
        {screen}
        {decision}
      </div>
      <div className={styles.right}>
        <PriceBoard tradePlan={tradePlan} />
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
        {status === undefined ? null : <NextCandleBoard status={status} />}
        <FearGreedScreen />
        <WallClocks />
      </div>
    </div>
  );
}
