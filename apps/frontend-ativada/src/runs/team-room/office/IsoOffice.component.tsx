// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import type { BalconyAgent } from '../balcony/balcony-agents.js';
import { useSceneMotion } from '../motion/useSceneMotion.hook.js';
import { OFFICE_TEXT } from './office.constant.js';
import { deskSpecOf } from './office-grid.js';
import type { ClockModel, ScreenModel } from './office-model.js';
import { SEATED } from './office-walk-state.js';
import styles from './IsoOffice.module.css';
import { IsoDesk } from './IsoDesk.component.js';
import { IsoRoom } from './IsoRoom.component.js';
import { IsoWalker } from './IsoWalker.component.js';
import { useOfficeVisibility } from './useOfficeVisibility.hook.js';
import { useOfficeWalk } from './useOfficeWalk.hook.js';

export type IsoOfficeProps = {
  // Os seis agentes de regra (sempre) e só as equipes de modelo LIGADAS.
  readonly agents: readonly BalconyAgent[];
  readonly clock: ClockModel;
  readonly screen: ScreenModel;
  readonly isAnimationOn: boolean;
  // Muda a cada vela nova e chama a reunião na mesa da Alice.
  readonly meetingKey: number | undefined;
};

// O escritório em perspectiva isométrica: cenário fixo (janela da cidade, quadro de cotações, relógio, plantas), mesas com
// computador e a equipe que anda pelos corredores. Decorativo (`aria-hidden`): nomes, cargos e estados também estão na lista de
// crachás logo abaixo. Parado (movimento reduzido, animação desligada, aba oculta ou fora da tela) ficam só as poses fixas.
export function IsoOffice(props: IsoOfficeProps): ReactElement {
  const { agents, clock, screen, isAnimationOn, meetingKey } = props;
  const visibility = useOfficeVisibility();
  const motion = useSceneMotion({ isAnimationOn, isAutoPaused: visibility.isAutoPaused });
  const walk = useOfficeWalk({ motion, meetingKey });
  return (
    <div ref={visibility.ref} className={styles.box}>
      <div
        className={styles.stage}
        aria-hidden="true"
        data-iso-office=""
        data-moving={walk.isMoving ? 'on' : undefined}
        data-rhythm={walk.isMoving ? motion.rhythmName : undefined}
      >
        <IsoRoom clock={clock} screen={screen} />
        {agents.map((agent) => {
          const spec = deskSpecOf(agent.slot);
          return spec === undefined ? null : <IsoDesk key={agent.slot} spec={spec} />;
        })}
        {agents.map((agent) => {
          const placement = walk.state[agent.slot] ?? SEATED[agent.slot];
          return placement === undefined ? null : (
            <IsoWalker
              key={agent.slot}
              agent={agent}
              placement={placement}
              isMoving={walk.isMoving}
            />
          );
        })}
      </div>
      <p className={styles.note}>{OFFICE_TEXT.ISO_NOTE}</p>
    </div>
  );
}
