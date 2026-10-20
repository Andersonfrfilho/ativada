// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement, ReactNode } from 'react';

import { useAppConfig } from '../../app/useAppContext.hook.js';
import type { LiveStatus } from '../live-tracking/live-status.validation.js';
import { FearGreedScreen } from './FearGreedScreen.component.js';
import { useTradePlanQuery } from './trade-plan.query.js';
import { NextCandleBoard, PriceBoard } from './WallBoards.component.js';
import { WallClocks, WallHeatmap } from './WallScreens.component.js';
import { WallTicker } from './WallTicker.component.js';
import styles from './TradingRoom.module.css';

export type RoomWallProps = {
  readonly runId: string;
  readonly screen: ReactNode;
  readonly status: LiveStatus | undefined;
  readonly isMoving: boolean;
};

// A parede: o letreiro em cima, o telão no meio e as telas e quadros dos lados. O telão vem PRIMEIRO no DOM (ordem de
// foco: Calmo, telão, quadros); a grade põe cada um no lugar. O telão nunca troca de pai (o gráfico não recarrega).
export function RoomWall({ runId, screen, status, isMoving }: RoomWallProps): ReactElement {
  const symbols = useAppConfig().marketSymbols;
  const tradePlan = useTradePlanQuery(runId, true).data;
  return (
    <div className={styles.wall} data-motion={isMoving ? 'on' : undefined}>
      <div className={styles.screen}>{screen}</div>
      <div className={styles.ticker}>
        <WallTicker symbols={symbols} />
      </div>
      <div className={styles.right}>
        <PriceBoard tradePlan={tradePlan} />
        <WallHeatmap symbols={symbols} />
      </div>
      <div className={styles.left}>
        {status === undefined ? null : <NextCandleBoard status={status} />}
        <WallClocks />
        <FearGreedScreen />
      </div>
    </div>
  );
}
