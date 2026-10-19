// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { BalconySlot } from '../balcony/balcony.constant.js';
import type { Cue, Cycle } from '../motion/cue-runner.js';
import type { Rhythm } from '../motion/motion-rhythm.js';
import { createRandom, type Random } from '../motion/seeded-random.js';
import {
  blockedFor,
  deskSpecOf,
  OFFICE_DESKS,
  OFFICE_SPOT,
  OFFICE_WALKERS,
  type Cell,
} from './office-grid.js';
import { routeBetween } from './office-route.js';

// 'walk' = a caminho; as outras são o que a pessoa faz parada no destino (papéis, apontar, conferir a prancheta).
export type Pose = 'sit' | 'walk' | 'paper' | 'point' | 'clip';

export type OfficePayload =
  | { readonly kind: 'reset' }
  | { readonly kind: 'move'; readonly slot: BalconySlot; readonly cell: Cell; readonly pose: Pose };

export type OfficeMode = 'idle' | 'meeting';

export type OfficeCycleInput = {
  readonly seed: number;
  readonly rhythm: Rhythm;
  readonly mode: OfficeMode;
};

type OfficeCue = Cue<OfficePayload>;

const TRIPS_PER_CYCLE = 3;
const MEETING_STAGGER_MILLISECONDS = 500;
const MEETING_ORDER: readonly BalconySlot[] = OFFICE_WALKERS.filter((slot) => slot !== 'alice');

function seatOf(slot: BalconySlot): Cell | undefined {
  return deskSpecOf(slot)?.seat;
}

// Os passos de um caminho: uma casa por `step`, a pessoa em marcha; no fim, a pose de quem chegou.
type WalkParams = {
  readonly slot: BalconySlot;
  readonly path: readonly Cell[];
  readonly at: number;
  readonly rhythm: Rhythm;
  readonly arrival: Pose;
};

function walkCues({ slot, path, at, rhythm, arrival }: WalkParams): {
  readonly cues: readonly OfficeCue[];
  readonly endsAt: number;
} {
  const step = rhythm.stepMilliseconds;
  const moves = path.map((cell, index) => ({
    at: at + index * step,
    payload: { kind: 'move', slot, cell, pose: 'walk' } as const,
  }));
  const last = path.at(-1);
  const endsAt = at + path.length * step;
  if (last === undefined) return { cues: [], endsAt: at };
  return {
    cues: [...moves, { at: endsAt, payload: { kind: 'move', slot, cell: last, pose: arrival } }],
    endsAt,
  };
}

type Trip = {
  readonly slot: BalconySlot;
  readonly to: Cell;
  readonly pose: Pose;
  readonly dwell: number;
};

// Ida, parada e volta ao assento. Sem caminho (ou já no destino) a viagem não existe.
function tripCues(trip: Trip, at: number, rhythm: Rhythm): { cues: OfficeCue[]; endsAt: number } {
  const seat = seatOf(trip.slot);
  const blocked = blockedFor(trip.slot);
  const there = seat === undefined ? undefined : routeBetween(seat, trip.to, blocked);
  const back = seat === undefined ? undefined : routeBetween(trip.to, seat, blocked);
  if (there === undefined || back === undefined || there.length === 0) {
    return { cues: [], endsAt: at };
  }
  const go = walkCues({ slot: trip.slot, path: there, at, rhythm, arrival: trip.pose });
  const home = walkCues({
    slot: trip.slot,
    path: back,
    at: go.endsAt + trip.dwell,
    rhythm,
    arrival: 'sit',
  });
  return { cues: [...go.cues, ...home.cues], endsAt: home.endsAt };
}

// Para onde alguém vai quando está ocioso: entregar papéis à Alice, olhar o quadro ou falar com um colega.
function pickTrip(slot: BalconySlot, random: Random, rhythm: Rhythm): Trip | undefined {
  const dwell = random.between(rhythm.gestureMilliseconds - 700, rhythm.gestureMilliseconds);
  const colleagues = OFFICE_DESKS.slice(0, 6).filter((spec) => spec.slot !== slot);
  const kinds = slot === 'alice' ? ['board', 'colleague'] : ['alice', 'board', 'colleague'];
  const kind = random.pick(kinds);
  if (kind === 'board') {
    const to = random.pick(OFFICE_SPOT.BOARD);
    return to === undefined ? undefined : { slot, to, pose: 'point', dwell };
  }
  if (kind === 'alice') {
    const to = random.pick(OFFICE_SPOT.ALICE);
    return to === undefined ? undefined : { slot, to, pose: 'paper', dwell };
  }
  const colleague = random.pick(colleagues);
  const pose: Pose = slot === 'otavio' ? 'clip' : 'paper';
  return colleague === undefined ? undefined : { slot, to: colleague.visit, pose, dwell };
}

// Ciclo ocioso: algumas viagens, uma de cada vez (nunca dois andando), a cada 2–9 s no ritmo vivo.
function idleCycle(input: OfficeCycleInput): Cycle<OfficePayload> {
  const { seed, rhythm } = input;
  const random = createRandom(seed);
  const cues: OfficeCue[] = [{ at: 0, payload: { kind: 'reset' } }];
  let at = random.between(rhythm.idleMinMilliseconds, rhythm.idleMaxMilliseconds);
  for (let index = 0; index < TRIPS_PER_CYCLE; index += 1) {
    const slot = random.pick(OFFICE_WALKERS);
    const trip = slot === undefined ? undefined : pickTrip(slot, random, rhythm);
    const done = trip === undefined ? undefined : tripCues(trip, at, rhythm);
    if (done !== undefined) {
      cues.push(...done.cues);
      at = done.endsAt;
    }
    at += random.between(rhythm.idleMinMilliseconds, rhythm.idleMaxMilliseconds);
  }
  return { cues, lengthMilliseconds: at };
}

// Reunião (~20 s no ritmo vivo): a Alice levanta os papéis na mesa dela e os outros cinco vão ao redor, escalonados, e voltam.
function meetingCycle(input: OfficeCycleInput): Cycle<OfficePayload> {
  const { rhythm } = input;
  const cues: OfficeCue[] = [{ at: 0, payload: { kind: 'reset' } }];
  let endsAt = rhythm.meetingMilliseconds;
  MEETING_ORDER.forEach((slot, index) => {
    const to = OFFICE_SPOT.MEETING[index];
    if (to === undefined) return;
    const start = (index + 1) * MEETING_STAGGER_MILLISECONDS;
    const pose: Pose = index % 2 === 0 ? 'paper' : 'point';
    const dwell = rhythm.meetingMilliseconds - start;
    const done = tripCues({ slot, to, pose, dwell }, start, rhythm);
    cues.push(...done.cues);
    endsAt = Math.max(endsAt, done.endsAt);
  });
  const aliceSeat = seatOf('alice');
  if (aliceSeat !== undefined) {
    cues.push({
      at: MEETING_STAGGER_MILLISECONDS,
      payload: { kind: 'move', slot: 'alice', cell: aliceSeat, pose: 'paper' },
    });
    cues.push({
      at: endsAt,
      payload: { kind: 'move', slot: 'alice', cell: aliceSeat, pose: 'sit' },
    });
  }
  return { cues: cues.sort((a, b) => a.at - b.at), lengthMilliseconds: endsAt + 1000 };
}

// Um ciclo do escritório como DADO PURO: determinístico com a mesma semente, rotas sem mesa e sempre de volta ao assento.
export function buildOfficeCycle(input: OfficeCycleInput): Cycle<OfficePayload> {
  return input.mode === 'meeting' ? meetingCycle(input) : idleCycle(input);
}
