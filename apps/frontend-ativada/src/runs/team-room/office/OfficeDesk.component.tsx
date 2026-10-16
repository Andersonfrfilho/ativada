// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon } from '../../../layout/Icon.component.js';
import { StatusChip } from '../../live-tracking/StatusChip.component.js';
import type { BalconyAgent } from '../balcony/balcony-agents.js';
import { SpeechBubble } from '../SpeechBubble.component.js';
import { Placard } from '../SpecialistSeat.component.js';
import roomStyles from '../TeamRoom.module.css';
import { TeamFigure } from '../TeamFigure.component.js';
import type { SeatState } from '../team-room-sequence.js';
import { VOTE_LOOK } from '../team-room-view.js';
import type { TeamFamily } from '../team-room.constant.js';
import type { RuleLine, SpecialistView } from '../team-room.types.js';
import { OFFICE_TEXT } from './office.constant.js';
import styles from './Office.module.css';
import type { MonitorModel } from './office-monitors.js';
import { OfficeMonitor } from './OfficeMonitor.component.js';

const SEAT_CLASS: Readonly<Record<TeamFamily, string | undefined>> = {
  trend: styles.seatTrend,
  reversion: styles.seatReversion,
  volume: styles.seatVolume,
  sentiment: styles.seatSentiment,
  other: undefined,
};

export type OfficeDeskProps = {
  readonly family: TeamFamily;
  readonly agent: BalconyAgent;
  readonly specialist: SpecialistView | undefined;
  readonly monitor: MonitorModel;
  readonly state: SeatState;
  // A placa que esta mesa levanta no sinal (hoje só a Renata); sem sinal, nada.
  readonly plaque: string | undefined;
};

// Os três pontinhos de quem ainda pensa: só durante a coreografia, por cima do balão que já está no texto.
export function Dots(): ReactElement {
  return (
    <span className={styles.dots} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

// Uma regra no balão do escritório: voto em palavras e a frase do servidor (ou, na vela revista, a leitura gravada).
function OfficeRuleItem({ rule }: { readonly rule: RuleLine }): ReactElement {
  const look = VOTE_LOOK[rule.voteKind];
  const said = rule.motive ?? (rule.reading === undefined ? undefined : `leitura ${rule.reading}`);
  return (
    <li className={roomStyles.rule}>
      <span className={roomStyles.ruleHead}>
        <span className={roomStyles.ruleName}>{rule.label}</span>
        <StatusChip tone={look.tone} icon={look.icon}>
          {look.word}
        </StatusChip>
      </span>
      {said === undefined ? null : <span className={roomStyles.motive}>{said}</span>}
    </li>
  );
}

function Speech({ specialist }: { readonly specialist: SpecialistView | undefined }): ReactElement {
  if (specialist === undefined) {
    return <span className={roomStyles.note}>{OFFICE_TEXT.NO_RULES}</span>;
  }
  return (
    <>
      <strong className={roomStyles.who}>{specialist.name}</strong>
      <ul className={roomStyles.rules}>
        {specialist.rules.map((rule) => (
          <OfficeRuleItem key={rule.ruleId} rule={rule} />
        ))}
      </ul>
    </>
  );
}

// Uma mesa de especialista: balão com as falas do servidor, monitor com as leituras gravadas, o bonequinho que caminha
// até a mesa da Alice entregando a ficha do voto e a plaquinha de nome.
export function OfficeDesk(props: OfficeDeskProps): ReactElement {
  const { family, agent, specialist, monitor, state, plaque } = props;
  return (
    <div
      className={`${styles.desk} ${SEAT_CLASS[family] ?? ''}`}
      data-state={state}
      data-slot={agent.slot}
    >
      <div className={styles.bubbleSlot} data-state={state} data-animated="">
        <Dots />
        <SpeechBubble tone={agent.tone}>
          <Speech specialist={specialist} />
        </SpeechBubble>
      </div>
      <OfficeMonitor model={monitor} />
      <div className={styles.walker} data-animated="">
        <TeamFigure role={agent.figureRole} tone={agent.tone} state={state} isRinging={false} />
        {agent.vote === undefined ? null : (
          <span className={styles.token} data-tone={agent.vote.tone}>
            <Icon name={agent.vote.icon} size={12} />
          </span>
        )}
      </div>
      {plaque === undefined ? null : (
        <p className={styles.plaque} data-animated="">
          {plaque}
        </p>
      )}
      <div className={styles.deskFront}>
        <strong>{agent.name}</strong>
        <span>{agent.roleShort}</span>
        {specialist === undefined ? null : <Placard specialist={specialist} />}
      </div>
    </div>
  );
}
