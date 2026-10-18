// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement } from 'react';

import type { LiveStatus } from '../../live-tracking/live-status.validation.js';
import { useModelTeamsView } from '../../model-teams/useModelTeamsView.hook.js';
import { useSceneMotion } from '../motion/useSceneMotion.hook.js';
import { useOfficeVisibility, type OfficeVisibility } from '../office/useOfficeVisibility.hook.js';
import { analystStateOf, REST_STEP, seatStateOf, type SeatState } from '../team-room-sequence.js';
import type { AuditorView, TeamRoomView } from '../team-room.types.js';
import { buildBalconyAgents } from './balcony-agents.js';
import { BalconySceneProvider } from './balcony-scene.context.js';
import { BALCONY_AGENTS, BALCONY_SLOT, type BalconySlot } from './balcony.constant.js';
import styles from './Balcony.module.css';
import { BalconyAgentSlot } from './BalconyAgentSlot.component.js';
import { ModelTeamsRunProvider } from '../../model-teams/ModelTeamsRun.context.js';
import { ModelTeamChips } from './ModelTeamChips.component.js';
import { BalconyBoard } from './BalconyBoard.component.js';
import { useBalconyScene, type BalconyScene } from './useBalconyScene.hook.js';

export type BalconyCrewProps = {
  readonly runId: string;
  readonly symbol: string;
  readonly position: LiveStatus['openPosition'];
  readonly view: TeamRoomView;
  readonly auditor: AuditorView | undefined;
  readonly horizon: string | undefined;
  readonly step: number;
  // A animação ligada no cartão; os balões em turnos e os gestos só rodam com ela (e sem movimento reduzido).
  readonly isAnimationOn: boolean;
};

const RULE_SLOTS: readonly BalconySlot[] = BALCONY_AGENTS.map((agent) => agent.slot);

function stateOf(slot: BalconySlot, index: number, props: BalconyCrewProps): SeatState {
  if (slot === BALCONY_SLOT.ALICE) return analystStateOf(props.view.specialists.length, props.step);
  return seatStateOf(index, props.step);
}

// Na sequência da vela nova os balões abrem por etapas; os turnos só valem em repouso, com a aba visível e a varanda na tela.
function useCrewScene(props: BalconyCrewProps): {
  readonly scene: BalconyScene;
  readonly visibilityRef: OfficeVisibility['ref'];
} {
  const visibility = useOfficeVisibility();
  const models = useModelTeamsView();
  const motion = useSceneMotion({
    isAnimationOn: props.isAnimationOn && props.step === REST_STEP,
    isAutoPaused: visibility.isAutoPaused,
  });
  const scene = useBalconyScene({
    slots: [...RULE_SLOTS, ...models.teams.map((card) => card.key)],
    motion,
  });
  return { scene, visibilityRef: visibility.ref };
}

function CrewBody(props: BalconyCrewProps): ReactElement {
  const { view, auditor, horizon, step, runId, symbol, position } = props;
  const [activeSlot, setActiveSlot] = useState<BalconySlot>(BALCONY_SLOT.ALICE);
  const { scene, visibilityRef } = useCrewScene(props);
  const agents = buildBalconyAgents({ view, auditor, horizon });
  return (
    <BalconySceneProvider scene={scene}>
      <div
        ref={visibilityRef}
        className={styles.balcony}
        data-motion={step === REST_STEP ? 'off' : 'on'}
        data-turns={scene.isTurns ? 'on' : undefined}
      >
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
        <ModelTeamChips activeSlot={activeSlot} onActivate={setActiveSlot} />
      </div>
    </BalconySceneProvider>
  );
}

// Os seis agentes em pé, a lousa ao lado e, no celular, um balão ativo por vez (o do último crachá tocado). Um relógio por cena:
// um agente fala por vez e as mãos/papéis/balanço seguem o roteiro; o estado fixo fica no crachá.
export function BalconyCrew(props: BalconyCrewProps): ReactElement {
  return (
    <ModelTeamsRunProvider runId={props.runId}>
      <CrewBody {...props} />
    </ModelTeamsRunProvider>
  );
}
