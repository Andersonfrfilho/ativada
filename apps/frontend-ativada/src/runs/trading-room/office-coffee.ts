// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Random } from '../team-room/motion/seeded-random.js';
import { COFFEE, COFFEE_QUEUE, COFFEE_SPOTS, seatOf } from './office-geometry.js';
import {
  isSamePoint,
  pointOf,
  sideFacing,
  tileOf,
  type Facing,
  type Point,
} from './office-grid.js';
import type { AgentLife, LifeAction, LifeState, Pose } from './office-life.types.js';

export const COFFEE_TEXT = 'Pausa para o café.';
export const BURN_LINES = ['Ai, tá quente!', 'Queimei a língua!'] as const;
export const SPILL_LINES = { OOPS: 'Ops!', SORRY: 'Derrubei o café…' } as const;
// O primeiro ladrilho fora da máquina: quem sai passa por ele e só então solta a vez.
export const COFFEE_EXIT: Point = pointOf({ c: tileOf(COFFEE).c, r: 1 });
const CHAT_STEPS = 20;
// Sorteio da pausa (com a semente do passo): 20% queimam a língua, 10% derrubam o café, nunca os dois.
const BURN_RATE = 0.2;
const SPILL_RATE = 0.3;

export type CoffeeVariant =
  | { readonly kind: 'none' }
  | { readonly kind: 'burn'; readonly line: string }
  | { readonly kind: 'spill' };
export type CoffeeOptions = { readonly home: Pose; readonly variant: CoffeeVariant };
export type MachineLook = 'idle' | 'pressing' | 'brewing' | 'ready';

export const NO_VARIANT: CoffeeVariant = { kind: 'none' };

export function coffeeVariantOf(random: Random): CoffeeVariant {
  const roll = random.next();
  if (roll < BURN_RATE) return { kind: 'burn', line: random.pick(BURN_LINES) ?? BURN_LINES[0] };
  return roll < SPILL_RATE ? { kind: 'spill' } : NO_VARIANT;
}

function pose(
  steps: number,
  name: Pose,
  extra?: Partial<Extract<LifeAction, { kind: 'wait' }>>,
): LifeAction {
  return { kind: 'wait', steps, pose: name, ...extra };
}

// Os pontos de bebericar já ocupados ou prometidos: onde alguém está ou o destino de uma caminhada na fila.
function takenSpots(agents: readonly AgentLife[]): readonly Point[] {
  return agents.flatMap((agent) => [
    agent.at,
    ...agent.queue.flatMap((action) => (action.kind === 'walk' ? [action.to] : [])),
  ]);
}

// Na máquina, cada pose dura de 0,6 a 1,3 s (2 a 4 passos): chega e olha para a máquina, estica o braço, aperta o botão,
// espera o café pingar (respirando), pega a caneca e só solta a vez depois de dar o primeiro passo para fora.
const USE_MACHINE: readonly LifeAction[] = [
  { kind: 'await_machine' },
  { kind: 'walk', to: COFFEE },
  pose(2, 'standing', { face: 'w', say: COFFEE_TEXT }),
  pose(2, 'reaching', { face: 'w' }),
  pose(3, 'pressing', { face: 'w' }),
  pose(4, 'brewing', { face: 'w' }),
  pose(3, 'taking', { face: 'w' }),
  pose(2, 'holding', { face: 'w', cup: true }),
  { kind: 'walk', to: COFFEE_EXIT },
  { kind: 'free_machine' },
];

// Derruba o café logo ao sair da máquina, olha para baixo e volta para a fila por outra caneca.
const SPILL_AND_RETRY: readonly LifeAction[] = [
  { kind: 'spill' },
  pose(3, 'spilling', { face: 's', say: SPILL_LINES.OOPS, cup: false }),
  pose(3, 'embarrassed', { face: 's', say: SPILL_LINES.SORRY }),
  { kind: 'walk', to: COFFEE_QUEUE },
  ...USE_MACHINE,
];

// Levar à boca, assoprar, bebericar e baixar; quem queima a língua faz careta de frente, assopra e tenta de novo.
function drinkPhase(variant: CoffeeVariant, face: Facing): readonly LifeAction[] {
  const sip: readonly LifeAction[] = [
    pose(2, 'raising', { face }),
    pose(3, 'drinking'),
    pose(2, 'lowering'),
  ];
  if (variant.kind !== 'burn') return [pose(2, 'raising', { face }), pose(3, 'blowing'), ...sip];
  return [
    pose(2, 'raising', { face }),
    pose(2, 'drinking'),
    pose(4, 'burning', { face: 's', say: variant.line }),
    pose(3, 'blowing'),
    ...sip,
  ];
}

// O lado para onde olha quem bebe: para o outro ponto do café (onde o colega fica para conversar).
function drinkFacing(spot: Point): Facing {
  const other = COFFEE_SPOTS.find((candidate) => !isSamePoint(candidate, spot)) ?? spot;
  return sideFacing(spot, other, 's');
}

// A pausa do café como roteiro: anda até a fila, espera a vez, usa a máquina, sai para um ponto do café, bebe, conversa se
// houver colega e volta para a mesa. Sem ponto livre para beber ou com alguém já esperando na fila, devolve `undefined`.
export function planCoffee(
  agent: AgentLife,
  state: LifeState,
  options: CoffeeOptions,
): readonly LifeAction[] | undefined {
  const isQueued = state.agents.some((other) =>
    other.queue.some((action) => action.kind === 'await_machine'),
  );
  const taken = takenSpots(state.agents);
  const spot = COFFEE_SPOTS.find(
    (candidate) => !taken.some((point) => isSamePoint(point, candidate)),
  );
  if (isQueued || spot === undefined) return undefined;
  const face = drinkFacing(spot);
  return [
    { kind: 'walk', to: COFFEE_QUEUE },
    ...USE_MACHINE,
    ...(options.variant.kind === 'spill' ? SPILL_AND_RETRY : []),
    { kind: 'walk', to: spot },
    ...drinkPhase(options.variant, face),
    { kind: 'chat', steps: CHAT_STEPS },
    pose(1, 'raising', { face }),
    pose(2, 'drinking'),
    pose(1, 'lowering'),
    { kind: 'walk', to: seatOf(agent.who) },
    pose(1, options.home, { face: 's', cup: false }),
  ];
}

// O que a máquina mostra: o botão aceso enquanto alguém aperta, o café pingando na caneca e a caneca pronta para pegar.
export function machineLookOf(agents: readonly AgentLife[]): MachineLook {
  if (agents.some((agent) => agent.pose === 'brewing')) return 'brewing';
  if (agents.some((agent) => agent.pose === 'taking')) return 'ready';
  return agents.some((agent) => agent.pose === 'pressing') ? 'pressing' : 'idle';
}
