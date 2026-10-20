// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useRef, type ReactElement } from 'react';

import type { AgentLife } from './office-life.types.js';
import { PixelAvatar } from './PixelAvatar.component.js';
import { usePlacement } from './usePlacement.hook.js';
import styles from './Office.module.css';

const SPEECH_FLIP_X = 1000;

// Um agente no piso: o avatar na pose da hora, o nome quando anda ou aponta e a fala curta. Decorativo: a lista em texto
// abaixo da cena carrega o que cada um acha.
export function OfficeAgent({
  agent,
  name,
}: {
  readonly agent: AgentLife;
  readonly name: string;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  usePlacement(ref, agent.at);
  return (
    <div ref={ref} className={styles.agent} data-pose={agent.pose} data-face={agent.face}>
      <PixelAvatar who={agent.who} />
      <span className={styles.agentName}>{name}</span>
      {agent.speech === undefined || agent.speech === '' ? null : (
        <span className={styles.say} data-side={agent.at.x > SPEECH_FLIP_X ? 'left' : 'right'}>
          <b>{name}:</b> {agent.speech}
        </span>
      )}
    </div>
  );
}
