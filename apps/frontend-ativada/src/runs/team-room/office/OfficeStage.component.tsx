// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement, Ref } from 'react';

import { buildBalconyAgents } from '../balcony/balcony-agents.js';
import type { SeatState } from '../team-room-sequence.js';
import type { AuditorView, TeamRoomView } from '../team-room.types.js';
import { OFFICE_DESK_FAMILIES, OFFICE_PHASE } from './office.constant.js';
import styles from './Office.module.css';
import { buildMonitor } from './office-monitors.js';
import { OfficeDesk } from './OfficeDesk.component.js';
import { OfficeAlice, OfficeAuditor, OfficeCorners } from './OfficeFront.component.js';
import { OfficeWall } from './OfficeWall.component.js';
import type { OfficeModel } from './useOfficeModel.hook.js';
import type { OfficeSceneState } from './useOfficeScene.hook.js';

export type OfficeStageProps = {
  readonly view: TeamRoomView;
  readonly auditor: AuditorView | undefined;
  readonly office: OfficeModel;
  readonly scene: OfficeSceneState;
  readonly boxRef: Ref<HTMLDivElement>;
};

function stateOf(scene: OfficeSceneState, until: string): SeatState {
  return scene.isRunning && !scene.phases.some((phase) => phase === until) ? 'thinking' : 'spoken';
}

type DesksProps = Pick<OfficeStageProps, 'view' | 'auditor' | 'office' | 'scene'>;

function Desks({ view, auditor, office, scene }: DesksProps): ReactElement {
  const agents = buildBalconyAgents({ view, auditor, horizon: undefined });
  const state = stateOf(scene, OFFICE_PHASE.SPEAK);
  return (
    <>
      {OFFICE_DESK_FAMILIES.map((family) => {
        const agent = agents.find((item) => item.family === family);
        const specialist = view.specialists.find((item) => item.family === family);
        if (agent === undefined) return null;
        return (
          <OfficeDesk
            key={family}
            family={family}
            agent={agent}
            specialist={specialist}
            monitor={buildMonitor(family, specialist)}
            state={state}
            plaque={family === 'reversion' ? office.plaque : undefined}
          />
        );
      })}
      <OfficeAlice
        view={view}
        state={stateOf(scene, OFFICE_PHASE.DECIDE)}
        votes={agents.filter((agent) => agent.family !== undefined)}
        isLocked={office.isLocked}
      />
    </>
  );
}

// O escritório inteiro em vista frontal (1200 × 760 em proporção): parede com relógio, telão e quadro de avisos; quatro
// mesas com monitores; a mesa da Alice; a mesa do Otávio; o café e a sala dos modelos. É decorativo (`aria-hidden`, nada
// focável): as mesmas falas e os crachás ficam na lista de texto logo abaixo.
export function OfficeStage(props: OfficeStageProps): ReactElement {
  const { auditor, office, scene, boxRef } = props;
  return (
    <div ref={boxRef} className={styles.stageBox}>
      <div
        className={styles.stage}
        aria-hidden="true"
        data-motion={scene.isRunning ? 'on' : 'off'}
        data-phases={scene.phases.join(' ')}
        data-light={office.light}
        data-idle={scene.isIdle}
        data-paused={scene.isPaused}
      >
        <span className={styles.light} data-animated="" />
        <OfficeWall clock={office.clock} screen={office.screen} board={office.board} />
        <Desks {...props} />
        <OfficeAuditor auditor={auditor} />
        <OfficeCorners />
      </div>
    </div>
  );
}
