// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement } from 'react';

import type { LiveStatus } from '../../live-tracking/live-status.validation.js';
import { analystStateOf, REST_STEP, seatStateOf, type SeatState } from '../team-room-sequence.js';
import type { AuditorView, TeamRoomView } from '../team-room.types.js';
import { buildBalconyAgents } from './balcony-agents.js';
import { BALCONY_SLOT, type BalconySlot } from './balcony.constant.js';
import styles from './Balcony.module.css';
import { BalconyAgentSlot } from './BalconyAgentSlot.component.js';
import { BalconyModels } from './BalconyModels.component.js';
import { BalconyBoard } from './BalconyBoard.component.js';

export type BalconyCrewProps = {
  readonly runId: string;
  readonly symbol: string;
  readonly position: LiveStatus['openPosition'];
  readonly view: TeamRoomView;
  readonly auditor: AuditorView | undefined;
  readonly horizon: string | undefined;
  readonly step: number;
};

function stateOf(slot: BalconySlot, index: number, props: BalconyCrewProps): SeatState {
  if (slot === BALCONY_SLOT.ALICE) return analystStateOf(props.view.specialists.length, props.step);
  return seatStateOf(index, props.step);
}

// Os seis agentes em pé, a lousa ao lado e, no celular, um balão ativo por vez (o do último crachá tocado).
export function BalconyCrew(props: BalconyCrewProps): ReactElement {
  const { view, auditor, horizon, step, runId, symbol, position } = props;
  const [activeSlot, setActiveSlot] = useState<BalconySlot>(BALCONY_SLOT.ALICE);
  const agents = buildBalconyAgents({ view, auditor, horizon });
  return (
    <div className={styles.balcony} data-motion={step === REST_STEP ? 'off' : 'on'}>
      <BalconyModels />
      <ul className={styles.crew}>
        {agents.map((agent, index) => (
          <BalconyAgentSlot
            key={agent.slot}
            agent={agent}
            state={stateOf(agent.slot, index, props)}
            isActive={agent.slot === activeSlot}
            onActivate={setActiveSlot}
          />
        ))}
      </ul>
      <BalconyBoard
        agents={agents}
        auditor={auditor}
        runId={runId}
        symbol={symbol}
        position={position}
      />
    </div>
  );
}
