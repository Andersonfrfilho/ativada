// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Random } from '../team-room/motion/seeded-random.js';
import { COFFEE, COFFEE_QUEUE, COFFEE_SPOTS, seatOf, type Point } from './office-geometry.js';
import type { AgentLife, LifeAction, LifeState, Pose } from './office-life.types.js';
import { routeSteps } from './office-route.js';

export const COFFEE_TEXT = 'Pausa para o café.';
export const BURN_LINES = ['Ai, tá quente!', 'Queimei a língua!'] as const;
export const SPILL_LINES = { OOPS: 'Ops!', SORRY: 'Derrubei o café…' } as const;
const PRESS_STEPS = 2;
const BREW_STEPS = 3;
const TAKE_STEPS = 2;
const SIP_STEPS = 4;
const REACT_STEPS = 2;
const CHAT_STEPS = 20;
const LAST_SIP_STEPS = 2;
// Sorteio da pausa (com a semente do passo): 20% queimam a língua, 10% derrubam o café, nunca os dois.
const BURN_RATE = 0.2;
const SPILL_RATE = 0.3;

export type CoffeeVariant =
  | { readonly kind: 'none' }
  | { readonly kind: 'burn'; readonly line: string }
  | { readonly kind: 'spill' };
export type CoffeeOptions = { readonly home: Pose; readonly variant: CoffeeVariant };
export type MachineLook = 'idle' | 'pressing' | 'brewing';

export const NO_VARIANT: CoffeeVariant = { kind: 'none' };

export function coffeeVariantOf(random: Random): CoffeeVariant {
  const roll = random.next();
  if (roll < BURN_RATE) return { kind: 'burn', line: random.pick(BURN_LINES) ?? BURN_LINES[0] };
  return roll < SPILL_RATE ? { kind: 'spill' } : NO_VARIANT;
}

function isSame(left: Point, right: Point): boolean {
  return left.x === right.x && left.y === right.y;
}

function walk(from: Point, to: Point): LifeAction {
  return { kind: 'walk', steps: routeSteps(from, to) };
}

// Os pontos de bebericar já ocupados ou prometidos: onde alguém está ou o último passo de uma caminhada na fila.
function takenSpots(agents: readonly AgentLife[]): readonly Point[] {
  return agents.flatMap((agent) => [
    agent.at,
    ...agent.queue.flatMap((action) => (action.kind === 'walk' ? action.steps.slice(-1) : [])),
  ]);
}

// Esperar a vez, apertar, esperar a caneca e pegar: o trecho em que só um fica na máquina.
const USE_MACHINE: readonly LifeAction[] = [
  { kind: 'await_machine' },
  { kind: 'walk', steps: [COFFEE] },
  { kind: 'wait', steps: PRESS_STEPS, pose: 'pressing', face: 'left' },
  { kind: 'wait', steps: BREW_STEPS, pose: 'brewing', say: COFFEE_TEXT },
  { kind: 'wait', steps: TAKE_STEPS, pose: 'taking', cup: true },
  { kind: 'free_machine' },
];

// Derruba o café no primeiro passo para fora da máquina, olha para baixo e volta para a fila por outra caneca.
function spillAndRetry(spot: Point): readonly LifeAction[] {
  const [first] = routeSteps(COFFEE, spot);
  const at = first ?? COFFEE;
  return [
    { kind: 'walk', steps: [at] },
    { kind: 'spill' },
    { kind: 'wait', steps: REACT_STEPS, pose: 'spilling', say: SPILL_LINES.OOPS, cup: false },
    { kind: 'wait', steps: REACT_STEPS + 1, pose: 'embarrassed', say: SPILL_LINES.SORRY },
    walk(at, COFFEE_QUEUE),
    ...USE_MACHINE,
  ];
}

function drinkPhase(variant: CoffeeVariant): readonly LifeAction[] {
  const sip = (steps: number, face?: 'left'): LifeAction => ({
    kind: 'wait',
    steps,
    pose: 'drinking',
    face,
  });
  if (variant.kind !== 'burn') return [sip(SIP_STEPS, 'left')];
  return [
    sip(REACT_STEPS, 'left'),
    { kind: 'wait', steps: REACT_STEPS, pose: 'burning', say: variant.line },
    { kind: 'wait', steps: REACT_STEPS, pose: 'blowing' },
    sip(REACT_STEPS),
  ];
}

// A pausa do café como roteiro: anda até a fila, espera a vez, aperta o botão, espera a caneca, pega, sai para o lado, bebe,
// conversa se houver colega e volta para a mesa. Só um na máquina por vez; sem ponto livre para beber ou com alguém já
// esperando na fila, devolve `undefined`.
export function planCoffee(
  agent: AgentLife,
  state: LifeState,
  options: CoffeeOptions,
): readonly LifeAction[] | undefined {
  const isQueued = state.agents.some((other) =>
    other.queue.some((action) => action.kind === 'await_machine'),
  );
  const taken = takenSpots(state.agents);
  const spot = COFFEE_SPOTS.find((candidate) => !taken.some((point) => isSame(point, candidate)));
  if (isQueued || spot === undefined) return undefined;
  return [
    walk(agent.at, COFFEE_QUEUE),
    ...USE_MACHINE,
    ...(options.variant.kind === 'spill' ? spillAndRetry(spot) : []),
    walk(COFFEE, spot),
    ...drinkPhase(options.variant),
    { kind: 'chat', steps: CHAT_STEPS },
    { kind: 'wait', steps: LAST_SIP_STEPS, pose: 'drinking' },
    walk(spot, seatOf(agent.who)),
    { kind: 'wait', steps: 1, pose: options.home, cup: false },
  ];
}

// O que a máquina mostra: o botão aceso enquanto alguém aperta e a caneca embaixo do bico enquanto o café sai.
export function machineLookOf(agents: readonly AgentLife[]): MachineLook {
  if (agents.some((agent) => agent.pose === 'brewing')) return 'brewing';
  return agents.some((agent) => agent.pose === 'pressing') ? 'pressing' : 'idle';
}
