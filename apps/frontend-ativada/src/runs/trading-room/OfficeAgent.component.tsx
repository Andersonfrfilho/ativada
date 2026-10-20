// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useRef, type ReactElement } from 'react';

import { avatarLookOf } from './avatar-look.js';
import { COFFEE_SPOTS } from './office-geometry.js';
import { isSamePoint } from './office-grid.js';
import type { AgentLife } from './office-life.types.js';
import { PixelAvatar } from './PixelAvatar.component.js';
import { usePlacement } from './usePlacement.hook.js';
import styles from './Office.module.css';

const SPEECH_FLIP_X = 1000;

// O balão de fala: em quem bebe no canto do café fica pequeno e preso na parede acima do canto; no resto, ao lado do boneco.
function sideOf(agent: AgentLife): 'corner' | 'left' | 'right' {
  if (COFFEE_SPOTS.some((spot) => isSamePoint(spot, agent.at))) return 'corner';
  return agent.at.x > SPEECH_FLIP_X ? 'left' : 'right';
}

// Um agente no piso: o avatar na pose e na direção da hora, o nome quando anda ou aponta e a fala curta. Decorativo: a
// lista em texto abaixo da cena carrega o que cada um acha.
export function OfficeAgent({
  agent,
  name,
  isMoving,
}: {
  readonly agent: AgentLife;
  readonly name: string;
  readonly isMoving: boolean;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  usePlacement(ref, agent.at);
  const look = avatarLookOf(agent, isMoving);
  return (
    <div
      ref={ref}
      className={styles.agent}
      data-pose={agent.pose}
      data-face={agent.face}
      data-look={look.name}
      data-mirror={look.isMirrored ? 'true' : undefined}
      data-anim={look.animation}
    >
      <span className={styles.shadow} data-shadow />
      <PixelAvatar who={agent.who} look={look} />
      <span className={styles.agentName}>{name}</span>
      {agent.speech === undefined || agent.speech === '' ? null : (
        <span className={styles.say} data-side={sideOf(agent)}>
          <b>{name}:</b> {agent.speech}
        </span>
      )}
    </div>
  );
}
