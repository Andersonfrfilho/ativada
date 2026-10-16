// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { ANALYST_TEXT } from '../../analyst/analyst.constant.js';
import { Icon } from '../../../layout/Icon.component.js';
import { StrategySummarySpeech, RiskAnalystSpeech } from '../AnalystSeat.component.js';
import { AuditorSpeech } from '../AuditorSeat.component.js';
import type { BalconyAgent } from '../balcony/balcony-agents.js';
import { BALCONY_MODELS, BALCONY_TEXT } from '../balcony/balcony.constant.js';
import { SpeechBubble } from '../SpeechBubble.component.js';
import roomStyles from '../TeamRoom.module.css';
import { TeamFigure } from '../TeamFigure.component.js';
import type { SeatState } from '../team-room-sequence.js';
import { TEAM_ROOM_TEXT } from '../team-room.constant.js';
import type { AuditorView, TeamRoomView } from '../team-room.types.js';
import { OFFICE_TEXT } from './office.constant.js';
import styles from './Office.module.css';
import { Dots } from './OfficeDesk.component.js';

export type OfficeAliceProps = {
  readonly view: TeamRoomView;
  readonly state: SeatState;
  readonly votes: readonly BalconyAgent[];
  readonly isLocked: boolean;
};

function AliceSpeech({ view }: { readonly view: TeamRoomView }): ReactElement {
  const { riskAnalyst } = view;
  return riskAnalyst === undefined ? (
    <StrategySummarySpeech view={view} />
  ) : (
    <RiskAnalystSpeech risk={riskAnalyst} />
  );
}

// As placas da Alice: a postura (só com analista de risco de verdade) e, com trava ligada, o aviso de que não há compra nova.
function AliceSigns({ view, isLocked }: Pick<OfficeAliceProps, 'view' | 'isLocked'>): ReactElement {
  const { riskAnalyst } = view;
  return (
    <>
      {riskAnalyst === undefined ? null : (
        <p className={styles.postureSign} data-tone={riskAnalyst.look.tone} data-animated="">
          <Icon name={riskAnalyst.look.icon} size={14} />
          {OFFICE_TEXT.POSTURE} {riskAnalyst.look.word}
        </p>
      )}
      {isLocked ? (
        <p className={styles.pauseSign} data-animated="">
          <Icon name="lock" size={14} />
          {OFFICE_TEXT.LOCK_ON}
        </p>
      ) : null}
    </>
  );
}

// A mesa da Alice: é nela que a equipe entrega a opinião (as fichas dos votos) e é dela a placa da postura.
export function OfficeAlice({ view, state, votes, isLocked }: OfficeAliceProps): ReactElement {
  const { riskAnalyst } = view;
  return (
    <>
      <div className={styles.table}>
        <strong>{OFFICE_TEXT.ALICE_TABLE}</strong>
        <span>{OFFICE_TEXT.ALICE_TABLE_NOTE}</span>
        <ul className={styles.tokens}>
          {votes.map((agent) => (
            <li key={agent.slot} className={styles.tableToken} data-tone={agent.vote?.tone}>
              {agent.vote?.word}
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.alice} data-state={state}>
        <div className={styles.bubbleSlot} data-state={state} data-animated="">
          <Dots />
          <SpeechBubble tone="plain">
            <AliceSpeech view={view} />
          </SpeechBubble>
        </div>
        <AliceSigns view={view} isLocked={isLocked} />
        <div className={styles.walker} data-animated="">
          <TeamFigure role="analyst" tone="normal" state={state} isRinging={false} />
        </div>
        <span className={styles.nameTag}>
          {riskAnalyst === undefined ? 'Resumo' : ANALYST_TEXT.SEAT_NAME}
        </span>
      </div>
    </>
  );
}

// O Otávio, na mesa dele, com a prancheta de Wilson: confere cada um contra a moeda ao ar.
export function OfficeAuditor({
  auditor,
}: {
  readonly auditor: AuditorView | undefined;
}): ReactElement {
  return (
    <div className={styles.auditor}>
      <div className={styles.bubbleSlot} data-state="spoken">
        <SpeechBubble tone="plain">
          <strong className={roomStyles.who}>{TEAM_ROOM_TEXT.AUDITOR_NAME}</strong>
          {auditor === undefined ? (
            <span className={roomStyles.motive}>Conferindo os acertos…</span>
          ) : (
            <AuditorSpeech auditor={auditor} isCompact />
          )}
        </SpeechBubble>
      </div>
      <p className={styles.clipboard} data-animated="">
        {OFFICE_TEXT.AUDITOR_CLIPBOARD}
      </p>
      <div className={styles.walker}>
        <TeamFigure role="auditor" tone="normal" state="spoken" isRinging={false} />
      </div>
      <span className={styles.nameTag}>{TEAM_ROOM_TEXT.AUDITOR_NAME}</span>
    </div>
  );
}

// O cantinho do café e a sala de vidro dos modelos (◆ "em breve"): apagados, nunca falam nem votam.
export function OfficeCorners(): ReactElement {
  return (
    <>
      <div className={styles.coffee}>
        <span className={styles.coffeeMachine} />
        <span>{OFFICE_TEXT.COFFEE}</span>
      </div>
      <div className={styles.models}>
        <p className={styles.modelsHead}>
          <span aria-hidden="true">{BALCONY_TEXT.KIND_MODEL_MARK}</span> {OFFICE_TEXT.MODELS_ROOM}
        </p>
        <ul className={styles.modelList}>
          {BALCONY_MODELS.map((model) => (
            <li key={model.name} className={styles.modelCard}>
              <strong>
                <span aria-hidden="true">{BALCONY_TEXT.KIND_MODEL_MARK}</span> {model.name}
              </strong>
              <span>{model.role}</span>
              <span className={styles.modelTag}>
                {OFFICE_TEXT.MODEL_TAG} · {OFFICE_TEXT.MODEL_NOTE}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
