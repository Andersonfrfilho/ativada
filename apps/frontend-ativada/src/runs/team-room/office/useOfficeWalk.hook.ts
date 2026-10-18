// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useRef, useState } from 'react';

import { createCueRunner } from '../motion/cue-runner.js';
import { useMotionTimer } from '../motion/MotionClock.context.js';
import type { SceneMotion } from '../motion/useSceneMotion.hook.js';
import { buildOfficeCycle } from './office-script.js';
import { applyOfficeCue, SEATED, type OfficeWalkState } from './office-walk-state.js';

const BASE_SEED = 20_261_118;

export type OfficeWalkInput = {
  readonly motion: SceneMotion;
  // Muda a cada vela nova: a mudança (depois da primeira) chama a reunião na mesa da Alice.
  readonly meetingKey: number | undefined;
};

export type OfficeWalk = {
  readonly state: OfficeWalkState;
  // Falso = poses fixas: todos sentados, sem relógio, sem atributo de movimento.
  readonly isMoving: boolean;
};

// Um relógio por cena: o executor de pistas mantém UM temporizador pendente e todos os agentes leem o mesmo estado.
// A vela nova abre com a reunião; depois seguem os passeios ociosos.
export function useOfficeWalk({ motion, meetingKey }: OfficeWalkInput): OfficeWalk {
  const timer = useMotionTimer();
  const [state, setState] = useState<OfficeWalkState>(SEATED);
  const seenKey = useRef(meetingKey);
  const { isMoving, rhythm } = motion;
  useEffect(() => {
    const isMeeting = meetingKey !== undefined && seenKey.current !== meetingKey;
    seenKey.current = meetingKey;
    if (!isMoving) return undefined;
    const runner = createCueRunner({
      cycleOf: (cycle) =>
        buildOfficeCycle({
          seed: BASE_SEED + cycle,
          rhythm,
          mode: isMeeting && cycle === 0 ? 'meeting' : 'idle',
        }),
      timer,
      onCue: (payload) => setState((before) => applyOfficeCue(before, payload)),
    });
    runner.start();
    return (): void => {
      runner.stop();
      setState(SEATED);
    };
  }, [isMoving, rhythm, meetingKey, timer]);
  return { state: isMoving ? state : SEATED, isMoving };
}
