// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useCallback, useEffect, useRef, useState } from 'react';

import type { BalconySlot } from '../team-room/balcony/balcony.constant.js';
import { useMotionTimer } from '../team-room/motion/MotionClock.context.js';
import { createLife, startMeeting, STEP_MILLISECONDS, stepLife, withLines } from './office-life.js';
import type { LifeState } from './office-life.types.js';

const BASE_SEED = 20_261_020;

export type OfficeLifeInput = {
  readonly crew: readonly BalconySlot[];
  readonly lines: LifeState['lines'];
  // Muda quando a equipe decide uma vela nova: com movimento, vira reunião.
  readonly decisionKey: number | undefined;
  // Calmo, movimento reduzido ou aba escondida = falso: nada é agendado e a cena fica onde está.
  readonly isMoving: boolean;
};

function useLifeState(
  crew: readonly BalconySlot[],
  lines: LifeState['lines'],
): [LifeState, (update: (state: LifeState) => LifeState) => void] {
  const crewKey = crew.join(',');
  const [life, setLife] = useState(() => ({
    key: crewKey,
    state: createLife({ crew, seed: BASE_SEED, lines }),
  }));
  const current = life.key === crewKey ? life.state : createLife({ crew, seed: BASE_SEED, lines });
  if (life.key !== crewKey) setLife({ key: crewKey, state: current });
  const update = useCallback(
    (change: (state: LifeState) => LifeState): void =>
      setLife((before) => ({ key: before.key, state: change(before.state) })),
    [],
  );
  return [withLines(current, lines), update];
}

// Um temporizador por cena (o relógio de movimento, falso nos testes): cada passo agenda o próximo. Sem movimento, nada.
export function useOfficeLife({ crew, lines, decisionKey, isMoving }: OfficeLifeInput): LifeState {
  const timer = useMotionTimer();
  const [state, update] = useLifeState(crew, lines);
  const lastDecision = useRef(decisionKey);
  useEffect(() => {
    const before = lastDecision.current;
    lastDecision.current = decisionKey;
    if (!isMoving || before === undefined || decisionKey === undefined || before === decisionKey)
      return;
    update(startMeeting);
  }, [decisionKey, isMoving, update]);
  useEffect(() => {
    if (!isMoving) return undefined;
    return timer(() => update(stepLife), STEP_MILLISECONDS);
  }, [isMoving, state.tick, timer, update]);
  return state;
}
