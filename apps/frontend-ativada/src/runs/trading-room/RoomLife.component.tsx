// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useRef, type ReactElement } from 'react';

import { usePointedLevel, type PointedRole } from '../candle-chart/pointed-level.context.js';
import type { LiveStatus } from '../live-tracking/live-status.validation.js';
import { TEAM_RUN_NOTE } from '../model-teams/run-source-label.js';
import { AskTeam } from './AskTeam.component.js';
import { ModelTeamsFoot } from './ModelTeamsFoot.component.js';
import { OfficeFloor } from './OfficeFloor.component.js';
import { speakerOf } from './office-life.js';
import { QuestionHistory } from './QuestionHistory.component.js';
import { ROOM_QUESTIONS_TEXT } from './room-questions.constant.js';
import { DeskStrip, OpinionList } from './RoomParts.component.js';
import type { RoomOpinion } from './room-opinions.js';
import { TRADING_ROOM_TEXT } from './trading-room.constant.js';
import { useOfficeLife } from './useOfficeLife.hook.js';
import { useRoomQuestions, type QuestionEntry } from './useRoomQuestions.hook.js';
import { useTradingRoomModel } from './useTradingRoomModel.hook.js';
import styles from './TradingRoom.module.css';

export type RoomLifeProps = {
  readonly runId: string;
  readonly status: LiveStatus;
  readonly isWide: boolean;
  readonly isMoving: boolean;
};

// A ÚNICA região viva da sala: diz o que mudou por último, a decisão nova (a primeira vela vista não é anunciada) ou a
// resposta nova da caixa "Pergunte à equipe".
function useRoomAnnouncement(params: {
  readonly decisionKey: number | undefined;
  readonly leader: RoomOpinion | undefined;
  readonly latest: QuestionEntry | undefined;
}): string {
  const { decisionKey, leader, latest } = params;
  const seen = useRef({ decisionKey, answerKey: latest?.key, last: '' });
  const memory = seen.current;
  if (decisionKey !== memory.decisionKey) {
    const isFirst = memory.decisionKey === undefined;
    memory.decisionKey = decisionKey;
    if (!isFirst && leader !== undefined)
      memory.last = `${TRADING_ROOM_TEXT.DECIDED}: ${leader.intent.word}.`;
  }
  if (latest !== undefined && latest.key !== memory.answerKey) {
    memory.answerKey = latest.key;
    memory.last = `${latest.name} ${ROOM_QUESTIONS_TEXT.ANSWERED}: ${latest.text}`;
  }
  return memory.last;
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
  const questions = useRoomQuestions(runId, status.run.symbol);
  const latest = questions.latest;
  const life = useOfficeLife({
    crew: model.opinions.map((opinion) => opinion.slot),
    lines: model.lines,
    decisionKey: model.decisionKey,
    isMoving,
    answer: latest,
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
      <AskTeam questions={questions} />
      <QuestionHistory entries={questions.history} />
      <OpinionList opinions={model.opinions} />
      {model.isTeamRun ? <p className={styles.teamRunNote}>{TEAM_RUN_NOTE}</p> : null}
      <ModelTeamsFoot />
      <p className={styles.visuallyHidden} role="status" aria-live="polite">
        {useRoomAnnouncement({ decisionKey: model.decisionKey, leader, latest })}
      </p>
    </>
  );
}
