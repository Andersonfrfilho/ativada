// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { BalconySlot } from '../team-room/balcony/balcony.constant.js';
import type { Point } from './office-geometry.js';

export type Pose = 'seated' | 'standing' | 'walking' | 'pointing';
export type Facing = 'left' | 'right';

// O que um agente faz, passo a passo (um passo = um ladrilho ou uma pausa de um passo).
export type LifeAction =
  | { readonly kind: 'walk'; readonly steps: readonly Point[] }
  | {
      readonly kind: 'wait';
      readonly steps: number;
      readonly pose: Pose;
      readonly say?: string | undefined;
    }
  | { readonly kind: 'reply'; readonly host: BalconySlot; readonly text: string }
  | { readonly kind: 'release' };

export type AgentLife = {
  readonly who: BalconySlot;
  readonly at: Point;
  readonly pose: Pose;
  readonly face: Facing;
  readonly queue: readonly LifeAction[];
  readonly speech: string | undefined;
  readonly speechSteps: number;
};

export type LifeLine = { readonly name: string; readonly line: string };

export type MeetingPhase = 'gathering' | 'banner' | 'returning';

export type LifeState = {
  readonly tick: number;
  readonly seed: number;
  readonly agents: readonly AgentLife[];
  // Quem está na frente do telão (um por vez).
  readonly screenHolder: BalconySlot | undefined;
  readonly meeting: { readonly phase: MeetingPhase; readonly bannerSteps: number } | undefined;
  // A fala curta de cada um quando um colega vem perguntar (texto do servidor, já resumido).
  readonly lines: Readonly<Partial<Record<BalconySlot, LifeLine>>>;
};
