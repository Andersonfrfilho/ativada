// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { DecisionContent } from './DecisionContent.component.js';
import { OfficeAgent } from './OfficeAgent.component.js';
import { Lectern, OfficeDesk } from './OfficeDesk.component.js';
import { OfficeBubble, OfficeLaser } from './OfficeTalk.component.js';
import { speakerOf } from './office-life.js';
import type { LifeState } from './office-life.types.js';
import type { RoomOpinion } from './room-opinions.js';
import { RoomArt } from './RoomArt.component.js';
import { TRADING_ROOM_TEXT } from './trading-room.constant.js';
import styles from './Office.module.css';

export type OfficeFloorProps = {
  readonly opinions: readonly RoomOpinion[];
  readonly life: LifeState;
  readonly isMoving: boolean;
};

function Talk({ opinions, life }: Omit<OfficeFloorProps, 'isMoving'>): ReactElement | null {
  const speaker = speakerOf(life);
  const opinion = opinions.find((item) => item.slot === speaker);
  const agent = life.agents.find((item) => item.who === speaker);
  if (opinion === undefined || agent === undefined) return null;
  return (
    <>
      <OfficeLaser spot={agent.at} />
      <OfficeBubble opinion={opinion} spot={agent.at} />
    </>
  );
}

// O piso da sala, abaixo da moldura do telão: mesas, bonecos, o balão de quem aponta e a faixa da reunião. Decorativo
// para o leitor de tela (a lista "O que cada um acha" diz o mesmo em texto) e sem nada focável.
export function OfficeFloor({ opinions, life, isMoving }: OfficeFloorProps): ReactElement {
  const leader = opinions.find((item) => item.kind === 'leader');
  return (
    <div className={styles.floor} data-motion={isMoving ? 'on' : undefined} aria-hidden="true">
      <RoomArt crew={life.agents.map((agent) => agent.who)} />
      {opinions.map((opinion) => (
        <OfficeDesk key={opinion.slot} opinion={opinion} />
      ))}
      <Lectern />
      {life.agents.map((agent) => (
        <OfficeAgent
          key={agent.who}
          agent={agent}
          name={opinions.find((item) => item.slot === agent.who)?.name ?? agent.who}
        />
      ))}
      <Talk opinions={opinions} life={life} />
      {life.meeting?.phase === 'banner' && leader !== undefined ? (
        <div className={styles.banner}>
          <DecisionContent leader={leader} label={TRADING_ROOM_TEXT.DECIDED} />
        </div>
      ) : null}
    </div>
  );
}
