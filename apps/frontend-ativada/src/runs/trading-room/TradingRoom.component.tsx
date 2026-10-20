// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, useRef, type ReactElement, type ReactNode } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { formatTimeInZone } from '../../format/zoned-time.js';
import { OFFICE_ANCHOR } from '../live-tracking/live-anchors.js';
import { useLiveStatusQuery } from '../live-tracking/live-status.query.js';
import type { LiveStatus } from '../live-tracking/live-status.validation.js';
import { ModelTeamsRunProvider } from '../model-teams/ModelTeamsRun.context.js';
import { TEAM_RUN_NOTE } from '../model-teams/run-source-label.js';
import { DecisionContent } from './DecisionContent.component.js';
import { OfficeFloor } from './OfficeFloor.component.js';
import { CalmToggle, DeskStrip, OpinionList } from './RoomParts.component.js';
import type { RoomOpinion } from './room-opinions.js';
import { TRADING_ROOM_TEXT } from './trading-room.constant.js';
import { useOfficeLife } from './useOfficeLife.hook.js';
import { useRoomMotion } from './useRoomMotion.hook.js';
import { useTradingRoomModel } from './useTradingRoomModel.hook.js';
import { RoomModelTeams } from './RoomModelTeams.component.js';
import { RoomWall } from './RoomWall.component.js';
import styles from './TradingRoom.module.css';

export type TradingRoomProps = {
  readonly runId: string;
  // O telão (o gráfico de produção na moldura de terminal); sem gráfico (simulação concluída), a parede fica sem ele.
  readonly screen: ReactNode;
};

// O anúncio só na troca da decisão (a primeira vela vista não é anunciada).
function useDecisionAnnouncement(
  decisionKey: number | undefined,
  leader: RoomOpinion | undefined,
): string {
  const firstKey = useRef(decisionKey);
  if (firstKey.current === undefined) firstKey.current = decisionKey;
  if (decisionKey === undefined || decisionKey === firstKey.current || leader === undefined)
    return '';
  return `${TRADING_ROOM_TEXT.DECIDED}: ${leader.intent.word}.`;
}

function DecisionBar({
  leader,
  status,
}: {
  readonly leader: RoomOpinion | undefined;
  readonly status: LiveStatus;
}): ReactElement | null {
  const timeZone = useUserTimeZone();
  if (leader === undefined) return null;
  const next = status.run.nextDecisionAt;
  const label =
    next === null
      ? TRADING_ROOM_TEXT.DECISION_NOW
      : `${TRADING_ROOM_TEXT.DECISION_NOW} · próxima vela ${formatTimeInZone(next, timeZone)}`;
  return (
    <div className={styles.decisionBar}>
      <DecisionContent leader={leader} label={label} />
    </div>
  );
}

type RoomLifeProps = {
  readonly runId: string;
  readonly status: LiveStatus;
  readonly isWide: boolean;
  readonly isMoving: boolean;
};

function RoomLife({ runId, status, isWide, isMoving }: RoomLifeProps): ReactElement {
  const model = useTradingRoomModel(runId, status);
  const crew = model.opinions.map((opinion) => opinion.slot);
  const life = useOfficeLife({
    crew,
    lines: model.lines,
    decisionKey: model.decisionKey,
    isMoving,
  });
  const leader = model.opinions.find((opinion) => opinion.kind === 'leader');
  return (
    <>
      {isWide ? (
        <OfficeFloor opinions={model.opinions} life={life} isMoving={isMoving} />
      ) : (
        <DeskStrip opinions={model.opinions} />
      )}
      <DecisionBar leader={leader} status={status} />
      <OpinionList opinions={model.opinions} />
      {model.isTeamRun ? <p className={styles.teamRunNote}>{TEAM_RUN_NOTE}</p> : null}
      <RoomModelTeams runId={runId} />
      <p className={styles.visuallyHidden} role="status" aria-live="polite">
        {useDecisionAnnouncement(model.decisionKey, leader)}
      </p>
    </>
  );
}

// A sala de operações (spec 011, Fase 3, direção E): o telão no alto cercado pela parede de telas, o piso com a equipe
// trabalhando, a decisão da equipe e o que cada um acha em texto.
export function TradingRoom({ runId, screen }: TradingRoomProps): ReactElement {
  const titleId = useId();
  const status = useLiveStatusQuery(runId, true).data;
  const { isWide, isMoving } = useRoomMotion();
  return (
    <section id={OFFICE_ANCHOR} className={styles.room} aria-labelledby={titleId}>
      <header className={styles.head}>
        <h2 id={titleId} className={styles.title}>
          {TRADING_ROOM_TEXT.TITLE}
        </h2>
        <p className={styles.hint}>{TRADING_ROOM_TEXT.HINT}</p>
        <CalmToggle />
      </header>
      <ModelTeamsRunProvider runId={runId}>
        <RoomWall runId={runId} screen={screen} status={status} isMoving={isMoving} />
        {status === undefined ? (
          <p role="status">{TRADING_ROOM_TEXT.LOADING}</p>
        ) : (
          <RoomLife runId={runId} status={status} isWide={isWide} isMoving={isMoving} />
        )}
      </ModelTeamsRunProvider>
      <p className={styles.foot}>{TRADING_ROOM_TEXT.DECISION_FOOT}</p>
    </section>
  );
}
