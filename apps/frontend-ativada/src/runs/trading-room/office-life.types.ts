// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { BalconySlot } from '../team-room/balcony/balcony.constant.js';
import type { Facing, Point } from './office-grid.js';

export type { Facing } from './office-grid.js';

export type Pose =
  | 'seated'
  | 'standing'
  | 'walking'
  | 'pointing'
  | 'reaching'
  | 'pressing'
  | 'brewing'
  | 'taking'
  | 'holding'
  | 'raising'
  | 'drinking'
  | 'lowering'
  | 'burning'
  | 'blowing'
  | 'spilling'
  | 'embarrassed';

// O que um agente faz, passo a passo (um passo = um ladrilho, em qualquer das 8 direções, ou uma pausa de um passo).
export type LifeAction =
  | {
      readonly kind: 'walk';
      readonly to: Point;
      // Passos seguidos sem conseguir andar (outro agente no caminho): passado o limite, troca o destino.
      readonly blocked?: number | undefined;
    }
  | {
      readonly kind: 'wait';
      readonly steps: number;
      readonly pose: Pose;
      readonly say?: string | undefined;
      // Para onde o boneco olha ao parar (a máquina, o telão, um colega) e se passa a segurar a caneca.
      readonly face?: Facing | undefined;
      readonly cup?: boolean | undefined;
    }
  | { readonly kind: 'await_machine' }
  | { readonly kind: 'free_machine' }
  | { readonly kind: 'spill' }
  // `patience`: quantos passos ainda espera sozinho por um colega que vem para o café (sem gastar a conversa).
  | { readonly kind: 'chat'; readonly steps: number; readonly patience?: number | undefined }
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
  // Fase do ciclo de caminhada (8 quadros, dois por passo); só anda quando o boneco anda.
  readonly stride: number;
};

export type LifeLine = { readonly name: string; readonly line: string };

// A pergunta da caixa "Pergunte à equipe": `key` muda a cada resposta nova; agendada = quem responde já tem a fila dela.
export type LifeAnswer = {
  readonly key: number;
  readonly who: BalconySlot;
  // A pergunta como o botão a mostra e a resposta do servidor, já em texto.
  readonly question: string;
  readonly text: string;
  readonly isScheduled: boolean;
};

export type MeetingPhase = 'gathering' | 'banner' | 'returning';

export type LifeState = {
  readonly tick: number;
  readonly seed: number;
  readonly agents: readonly AgentLife[];
  // Quem está na frente do telão (um por vez).
  readonly screenHolder: BalconySlot | undefined;
  // Quem usa a máquina de café agora (um por vez; o próximo espera no ladrilho da fila).
  readonly machineHolder: BalconySlot | undefined;
  // A poça de café derrubada no chão: some depois de alguns passos.
  readonly puddle: { readonly at: Point; readonly steps: number } | undefined;
  readonly meeting: { readonly phase: MeetingPhase; readonly bannerSteps: number } | undefined;
  // A fala curta de cada um quando um colega vem perguntar (texto do servidor, já resumido).
  readonly lines: Readonly<Partial<Record<BalconySlot, LifeLine>>>;
  readonly answer: LifeAnswer | undefined;
};
