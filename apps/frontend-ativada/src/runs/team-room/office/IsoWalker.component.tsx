// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import type { BalconyAgent } from '../balcony/balcony-agents.js';
import { BALCONY_TEXT } from '../balcony/balcony.constant.js';
import type { Gesture } from '../motion/gesture.js';
import { TeamFigure } from '../TeamFigure.component.js';
import { placeClass } from './iso-place.js';
import styles from './IsoWalker.module.css';
import type { Pose } from './office-script.js';
import type { Placement } from './office-walk-state.js';

const GESTURE_OF: Readonly<Record<Pose, Gesture | undefined>> = {
  sit: 'type',
  walk: undefined,
  paper: 'paper',
  point: 'point',
  clip: 'paper',
};

export type IsoWalkerProps = {
  readonly agent: BalconyAgent;
  readonly placement: Placement;
  // Falso = pose fixa: sem gesto, sem passo e sem atributo de movimento no DOM.
  readonly isMoving: boolean;
};

// Nome e cargo SEMPRE à vista (equipe de modelo: o estado em palavra, para a que está com problema).
function Plate({ agent }: { readonly agent: BalconyAgent }): ReactElement {
  const mark = agent.kind === 'model' ? BALCONY_TEXT.KIND_MODEL_MARK : BALCONY_TEXT.KIND_RULE_MARK;
  const detail = agent.kind === 'model' ? agent.seal.word : agent.roleShort;
  return (
    <span className={styles.plate} data-kind={agent.kind}>
      <strong>
        {mark} {agent.name}
      </strong>
      <span className={styles.role}>{detail}</span>
    </span>
  );
}

// Uma pessoa no escritório: o bonequinho na célula em que está e o crachá com nome e cargo. A posição vem das classes da célula;
// quando ela muda, a transição de `transform` faz o passo.
export function IsoWalker({ agent, placement, isMoving }: IsoWalkerProps): ReactElement {
  const { cell, pose } = placement;
  return (
    <div
      className={`${placeClass(cell)} ${styles.walker}`}
      data-slot={agent.slot}
      data-kind={agent.kind}
      data-pose={isMoving ? pose : undefined}
    >
      <span className={styles.sprite}>
        <TeamFigure
          role={agent.figureRole}
          tone={agent.tone}
          state={isMoving && pose === 'walk' ? 'thinking' : 'spoken'}
          isRinging={false}
          gesture={isMoving ? GESTURE_OF[pose] : undefined}
        />
      </span>
      <Plate agent={agent} />
    </div>
  );
}
