// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement, type ReactNode } from 'react';

import { PointedLevelProvider } from '../candle-chart/pointed-level.context.js';
import { OFFICE_ANCHOR } from '../live-tracking/live-anchors.js';
import { useLiveStatusQuery } from '../live-tracking/live-status.query.js';
import { ModelTeamsRunProvider } from '../model-teams/ModelTeamsRun.context.js';
import { RoomLife } from './RoomLife.component.js';
import { RoomWall } from './RoomWall.component.js';
import { TRADING_ROOM_TEXT } from './trading-room.constant.js';
import { useRoomMotion } from './useRoomMotion.hook.js';
import styles from './TradingRoom.module.css';

export type TradingRoomProps = {
  readonly runId: string;
  // O telão (o gráfico de produção na moldura de terminal); sem gráfico (simulação concluída), a parede fica sem ele.
  readonly screen: ReactNode;
};

// A sala de operações (spec 011, Fase 3, direção E), numa cena só: a parede com o telão no meio, a decisão da equipe e os quadros
// ao lado; o piso com as mesas logo abaixo do telão; depois o que cada um acha em texto.
export function TradingRoom({ runId, screen }: TradingRoomProps): ReactElement {
  const titleId = useId();
  const status = useLiveStatusQuery(runId, true).data;
  const { isWide, isMoving } = useRoomMotion();
  return (
    <section
      id={OFFICE_ANCHOR}
      className={styles.room}
      aria-labelledby={titleId}
      data-wide-page="true"
    >
      <h2 id={titleId} className={styles.visuallyHidden}>
        {TRADING_ROOM_TEXT.TITLE}
      </h2>
      <ModelTeamsRunProvider runId={runId}>
        <PointedLevelProvider>
          <RoomWall runId={runId} screen={screen} status={status} isMoving={isMoving} />
          {status === undefined ? (
            <p role="status">{TRADING_ROOM_TEXT.LOADING}</p>
          ) : (
            <RoomLife runId={runId} status={status} isWide={isWide} isMoving={isMoving} />
          )}
        </PointedLevelProvider>
      </ModelTeamsRunProvider>
      <p className={styles.foot}>{TRADING_ROOM_TEXT.DECISION_FOOT}</p>
    </section>
  );
}
