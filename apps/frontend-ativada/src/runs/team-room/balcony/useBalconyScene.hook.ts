// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useRef, useState } from 'react';

import { createCueRunner } from '../motion/cue-runner.js';
import { useMotionTimer } from '../motion/MotionClock.context.js';
import type { SceneMotion } from '../motion/useSceneMotion.hook.js';
import {
  applyCue,
  BALCONY_REST,
  buildBalconyCycle,
  type BalconySceneState,
} from './balcony-script.js';
import type { BalconySlot } from './balcony.constant.js';

const BASE_SEED = 20_261_018;

export type BalconySceneInput = {
  readonly slots: readonly BalconySlot[];
  readonly motion: SceneMotion;
};

export type BalconyScene = BalconySceneState & {
  // Verdadeiro só com a cena se mexendo: sem isso nenhum atributo de movimento é desenhado (poses fixas).
  readonly isTurns: boolean;
};

// Um relógio por cena: o executor de pistas mantém UM temporizador pendente; os seis (ou nove) agentes só leem o estado.
export function useBalconyScene({ slots, motion }: BalconySceneInput): BalconyScene {
  const timer = useMotionTimer();
  const [state, setState] = useState<BalconySceneState>(BALCONY_REST);
  const { isMoving, rhythm } = motion;
  const slotsKey = slots.join(',');
  const latestSlots = useRef(slots);
  useEffect(() => {
    latestSlots.current = slots;
  });
  useEffect(() => {
    if (!isMoving) return undefined;
    const runner = createCueRunner({
      cycleOf: (cycle) =>
        buildBalconyCycle({ seed: BASE_SEED + cycle, slots: latestSlots.current, rhythm }),
      timer,
      onCue: (payload) => setState((before) => applyCue(before, payload)),
    });
    runner.start();
    return (): void => {
      runner.stop();
      setState(BALCONY_REST);
    };
  }, [isMoving, rhythm, slotsKey, timer]);
  return isMoving ? { ...state, isTurns: true } : { ...BALCONY_REST, isTurns: false };
}
