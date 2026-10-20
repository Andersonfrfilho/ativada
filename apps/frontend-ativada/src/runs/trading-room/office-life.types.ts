// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { BalconySlot } from '../team-room/balcony/balcony.constant.js';
import type { Point } from './office-geometry.js';

export type Pose =
  | 'seated'
  | 'standing'
  | 'walking'
  | 'pointing'
  | 'pressing'
  | 'brewing'
  | 'taking'
  | 'drinking'
  | 'holding'
  | 'burning'
  | 'blowing'
  | 'spilling'
  | 'embarrassed';
export type Facing = 'left' | 'right';

// O que um agente faz, passo a passo (um passo = um ladrilho ou uma pausa de um passo).
export type LifeAction =
  | { readonly kind: 'walk'; readonly steps: readonly Point[] }
  | {
      readonly kind: 'wait';
      readonly steps: number;
      readonly pose: Pose;
      readonly say?: string | undefined;
      // Para onde o boneco olha ao parar (a máquina de café, por exemplo) e se passa a segurar a caneca.
      readonly face?: Facing | undefined;
      readonly cup?: boolean | undefined;
    }
  | { readonly kind: 'await_machine' }
  | { readonly kind: 'free_machine' }
  | { readonly kind: 'spill' }
  | { readonly kind: 'chat'; readonly steps: number }
  | { readonly kind: 'reply'; readonly host: BalconySlot; readonly text: string }
  | { readonly kind: 'release' };

export type AgentLife = {
  readonly who: BalconySlot;
  readonly at: Point;
  readonly pose: Pose;
  readonly face: Facing;
  readonly hasCup: boolean;
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
  // Quem usa a máquina de café agora (um por vez; o próximo espera no ladrilho ao lado).
  readonly machineHolder: BalconySlot | undefined;
  // A poça de café derrubada no chão: some depois de alguns passos.
  readonly puddle: { readonly at: Point; readonly steps: number } | undefined;
  readonly meeting: { readonly phase: MeetingPhase; readonly bannerSteps: number } | undefined;
  // A fala curta de cada um quando um colega vem perguntar (texto do servidor, já resumido).
  readonly lines: Readonly<Partial<Record<BalconySlot, LifeLine>>>;
};
