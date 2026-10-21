// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Cue, Cycle } from '../motion/cue-runner.js';
import { GESTURES, type Gesture } from '../motion/gesture.js';
import type { Rhythm } from '../motion/motion-rhythm.js';
import { createRandom, type Random } from '../motion/seeded-random.js';
import type { BalconySlot } from './balcony.constant.js';

export type BalconyPayload =
  | { readonly kind: 'speak'; readonly slot: BalconySlot | undefined }
  | {
      readonly kind: 'gesture';
      readonly slot: BalconySlot;
      // `undefined` = o gesto acabou e o agente volta à pose fixa.
      readonly gesture: Gesture | undefined;
    };

export type BalconyCycleInput = {
  readonly seed: number;
  readonly slots: readonly BalconySlot[];
  readonly rhythm: Rhythm;
};

// Quem fala agora (um por vez) e o gesto de cada agente.
export type BalconySceneState = {
  readonly speaker: BalconySlot | undefined;
  readonly gestures: Readonly<Partial<Record<BalconySlot, Gesture>>>;
};

export const BALCONY_REST: BalconySceneState = { speaker: undefined, gestures: {} };

export function applyCue(state: BalconySceneState, payload: BalconyPayload): BalconySceneState {
  if (payload.kind === 'speak') return { ...state, speaker: payload.slot };
  return { ...state, gestures: { ...state.gestures, [payload.slot]: payload.gesture } };
}

// Os turnos de fala: a ordem é embaralhada com a semente, cada um fala `turnMilliseconds` e, no fim, ninguém fala.
function speakCues(order: readonly BalconySlot[], rhythm: Rhythm): readonly Cue<BalconyPayload>[] {
  const turns = order.map((slot, index) => ({
    at: index * rhythm.turnMilliseconds,
    payload: { kind: 'speak', slot } as const,
  }));
  return [
    ...turns,
    { at: order.length * rhythm.turnMilliseconds, payload: { kind: 'speak', slot: undefined } },
  ];
}

// Gestos esparsos, a cada 2–9 s (no ritmo vivo): começam e terminam, e um agente nunca começa outro gesto no meio do seu.
function gestureCues(
  random: Random,
  input: BalconyCycleInput,
  endAt: number,
): readonly Cue<BalconyPayload>[] {
  const { slots, rhythm } = input;
  const busyUntil = new Map<BalconySlot, number>();
  const cues: Cue<BalconyPayload>[] = [];
  let at = random.between(rhythm.idleMinMilliseconds, rhythm.idleMaxMilliseconds);
  while (at < endAt) {
    const slot = random.pick(slots);
    const gesture = random.pick(GESTURES);
    if (slot !== undefined && gesture !== undefined && (busyUntil.get(slot) ?? 0) <= at) {
      busyUntil.set(slot, at + rhythm.gestureMilliseconds);
      cues.push({ at, payload: { kind: 'gesture', slot, gesture } });
      cues.push({
        at: at + rhythm.gestureMilliseconds,
        payload: { kind: 'gesture', slot, gesture: undefined },
      });
    }
    at += random.between(rhythm.idleMinMilliseconds, rhythm.idleMaxMilliseconds);
  }
  return cues;
}

// Um ciclo da varanda como DADO PURO: determinístico com a mesma semente, só um balão aberto por vez, pausa no fim.
export function buildBalconyCycle(input: BalconyCycleInput): Cycle<BalconyPayload> {
  const { seed, slots, rhythm } = input;
  if (slots.length === 0) return { cues: [], lengthMilliseconds: rhythm.idleMaxMilliseconds };
  const random = createRandom(seed);
  const speaking = speakCues(random.shuffle(slots), rhythm);
  const speakEnd = slots.length * rhythm.turnMilliseconds;
  const cues = [...speaking, ...gestureCues(random, input, speakEnd)].sort((a, b) => a.at - b.at);
  const lastAt = cues.at(-1)?.at ?? 0;
  return { cues, lengthMilliseconds: Math.max(speakEnd + rhythm.idleMinMilliseconds, lastAt) };
}
