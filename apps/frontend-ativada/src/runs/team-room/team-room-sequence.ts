// Copyright (c) 2026 Ada Technology. All rights reserved.
import { TEAM_ROOM_TIMELINE } from './team-room.constant.js';

// Passos da sequência de uma vela nova: 0 = todos pensam; 1..n = os especialistas falam um a um; n+1 = o resumo pensa;
// n+2 = o resumo fala. `REST_STEP` é o estado final (todos falaram), usado ao abrir a tela, ao rever e com movimento reduzido.
export const REST_STEP = -1;

export type SeatState = 'idle' | 'thinking' | 'spoken';
export type Timeline = typeof TEAM_ROOM_TIMELINE;
export type PlannedStep = { readonly step: number; readonly at: number };

export function seatStateOf(index: number, step: number): SeatState {
  if (step === REST_STEP) return 'spoken';
  return index < step ? 'spoken' : 'thinking';
}

export function analystStateOf(seatCount: number, step: number): SeatState {
  if (step === REST_STEP) return 'spoken';
  if (step <= seatCount) return 'idle';
  return step === seatCount + 1 ? 'thinking' : 'spoken';
}

// Quando cada passo começa, em milissegundos desde a vela nova (o último é a volta ao repouso).
export function planSequence(seatCount: number, timeline: Timeline): readonly PlannedStep[] {
  const first = timeline.thinkMilliseconds;
  const speakingEnd = first + Math.max(seatCount - 1, 0) * timeline.betweenMilliseconds;
  const analystThinks = first + seatCount * timeline.betweenMilliseconds;
  const analystSpeaks = analystThinks + timeline.analystThinkMilliseconds;
  const rests = analystSpeaks + timeline.analystSpeakMilliseconds;
  const speaking = Array.from({ length: seatCount }, (_, index) => ({
    step: index + 1,
    at: first + index * timeline.betweenMilliseconds,
  }));
  return [
    ...speaking,
    { step: seatCount + 1, at: Math.max(analystThinks, speakingEnd) },
    { step: seatCount + 2, at: analystSpeaks },
    { step: REST_STEP, at: rests },
  ];
}

export function totalMilliseconds(seatCount: number, timeline: Timeline): number {
  const last = planSequence(seatCount, timeline).at(-1);
  return (last?.at ?? 0) + timeline.announceAfterMilliseconds;
}
