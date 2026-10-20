// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useRef, type ReactElement } from 'react';

import { usePointedLevel, type PointedRole } from '../candle-chart/pointed-level.context.js';
import type { LiveStatus } from '../live-tracking/live-status.validation.js';
import { TEAM_RUN_NOTE } from '../model-teams/run-source-label.js';
import { ModelTeamsFoot } from './ModelTeamsFoot.component.js';
import { OfficeFloor } from './OfficeFloor.component.js';
import { speakerOf } from './office-life.js';
import { DeskStrip, OpinionList } from './RoomParts.component.js';
import type { RoomOpinion } from './room-opinions.js';
import { TRADING_ROOM_TEXT } from './trading-room.constant.js';
import { useOfficeLife } from './useOfficeLife.hook.js';
import { useTradingRoomModel } from './useTradingRoomModel.hook.js';
import styles from './TradingRoom.module.css';

export type RoomLifeProps = {
  readonly runId: string;
  readonly status: LiveStatus;
  readonly isWide: boolean;
  readonly isMoving: boolean;
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

// O nível que cada um aponta: a Alice a compra simulada, o auditor a proteção, os demais o alvo.
function roleOf(opinion: RoomOpinion | undefined): PointedRole {
  if (opinion === undefined || (opinion.rows.length === 0 && opinion.kind !== 'rule'))
    return undefined;
  if (opinion.kind === 'leader') return 'entry';
  return opinion.kind === 'auditor' ? 'stop' : 'target';
}

// O piso (ou a faixa no celular), a lista em texto e o anúncio. Quem aponta no telão engrossa a linha do nível dele.
export function RoomLife({ runId, status, isWide, isMoving }: RoomLifeProps): ReactElement {
  const model = useTradingRoomModel(runId, status);
  const crew = model.opinions.map((opinion) => opinion.slot);
  const life = useOfficeLife({
    crew,
    lines: model.lines,
    decisionKey: model.decisionKey,
    isMoving,
  });
  const leader = model.opinions.find((opinion) => opinion.kind === 'leader');
  const speaker = speakerOf(life);
  const { setRole } = usePointedLevel();
  const role = roleOf(model.opinions.find((opinion) => opinion.slot === speaker));
  useEffect(() => setRole(role), [role, setRole]);
  return (
    <>
      {isWide ? (
        <OfficeFloor opinions={model.opinions} life={life} isMoving={isMoving} />
      ) : (
        <DeskStrip opinions={model.opinions} />
      )}
      <OpinionList opinions={model.opinions} />
      {model.isTeamRun ? <p className={styles.teamRunNote}>{TEAM_RUN_NOTE}</p> : null}
      <ModelTeamsFoot />
      <p className={styles.visuallyHidden} role="status" aria-live="polite">
        {useDecisionAnnouncement(model.decisionKey, leader)}
      </p>
    </>
  );
}
