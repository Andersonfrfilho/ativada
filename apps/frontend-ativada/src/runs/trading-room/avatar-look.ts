// Copyright (c) 2026 Ada Technology. All rights reserved.
import { IDLE_FRONT } from './avatar-poses.js';
import type { Facing } from './office-grid.js';
import type { AgentLife, Pose } from './office-life.types.js';
import type { ArmMode, Expression, SpriteSpec, SpriteView } from './sprite-types.js';

// Qual desenho aparece: a vista sai da direção (8 direções; oeste é o leste espelhado), o quadro sai da pose. Com movimento
// há um segundo quadro (passo seguinte da caminhada, respiração ou digitação) que o CSS alterna; congelado, só o primeiro,
// e quem estava andando aparece parado.
export type AvatarAnimation = 'walk' | 'breath' | 'type';
export type AvatarLook = {
  readonly name: string;
  readonly main: SpriteSpec;
  readonly alt: SpriteSpec | undefined;
  readonly isMirrored: boolean;
  readonly animation: AvatarAnimation | undefined;
};

const VIEW_OF: Readonly<Record<Facing, readonly [SpriteView, boolean]>> = {
  s: ['s', false],
  se: ['se', false],
  e: ['e', false],
  ne: ['ne', false],
  n: ['n', false],
  sw: ['se', true],
  w: ['e', true],
  nw: ['ne', true],
};

const STRIDE_FRAMES = 8;

type CoffeeArt = { readonly arm: ArmMode; readonly face: Expression; readonly name: string };

const COFFEE_ART: Readonly<Partial<Record<Pose, CoffeeArt>>> = {
  reaching: { arm: 'reach', face: 'plain', name: 'reach' },
  pressing: { arm: 'press', face: 'plain', name: 'press' },
  taking: { arm: 'take', face: 'plain', name: 'take' },
  raising: { arm: 'raise', face: 'plain', name: 'raise' },
  lowering: { arm: 'raise', face: 'plain', name: 'raise' },
  drinking: { arm: 'sip', face: 'closed', name: 'sip' },
  blowing: { arm: 'blow', face: 'puff', name: 'blow' },
  burning: { arm: 'burn', face: 'squeeze', name: 'burn' },
  spilling: { arm: 'tilt', face: 'plain', name: 'tilt' },
};

export function viewOf(face: Facing): { readonly view: SpriteView; readonly isMirrored: boolean } {
  const [view, isMirrored] = VIEW_OF[face];
  return { view, isMirrored };
}

// A pausa do café é desenhada de lado (leste ou oeste) ou de frente.
function coffeeView(face: Facing): { readonly view: SpriteView; readonly isMirrored: boolean } {
  if (face === 's') return { view: 's', isMirrored: false };
  return { view: 'e', isMirrored: face === 'w' || face === 'sw' || face === 'nw' };
}

function walkLook(agent: AgentLife, isMoving: boolean): AvatarLook {
  const { view, isMirrored } = viewOf(agent.face);
  const arm: ArmMode = agent.hasCup ? 'hold' : isMoving ? 'swing' : 'down';
  const frame = (offset: number): SpriteSpec => {
    const phase = (agent.stride + offset) % STRIDE_FRAMES;
    const swing = phase < STRIDE_FRAMES / 2 ? 1 : -1;
    return { ...IDLE_FRONT, view, legs: phase, drop: phase % 4 === 1 ? 1 : 0, arm, swing };
  };
  if (!isMoving) {
    return {
      name: agent.hasCup ? 'hold' : 'idle',
      main: { ...IDLE_FRONT, view, arm },
      alt: undefined,
      isMirrored,
      animation: undefined,
    };
  }
  const name = agent.hasCup ? 'walk-hold' : 'walk';
  return { name, main: frame(0), alt: frame(1), isMirrored, animation: 'walk' };
}

function seatedLook(isMoving: boolean): AvatarLook {
  const main: SpriteSpec = { ...IDLE_FRONT, legs: 'seat', arm: 'type' };
  const alt = isMoving ? { ...main, alt: true } : undefined;
  return { name: 'type', main, alt, isMirrored: false, animation: isMoving ? 'type' : undefined };
}

function standLook(agent: AgentLife, isMoving: boolean): AvatarLook {
  const { view, isMirrored } = viewOf(agent.face);
  const isShy = agent.pose === 'embarrassed';
  const main: SpriteSpec = {
    ...IDLE_FRONT,
    view: isShy ? 's' : view,
    arm: agent.pose === 'pointing' ? 'point' : agent.hasCup ? 'hold' : 'down',
    face: isShy ? 'shy' : 'plain',
  };
  const name = agent.pose === 'pointing' ? 'point' : agent.hasCup ? 'hold' : 'idle';
  const canBreathe = isMoving && agent.pose !== 'pointing';
  const alt = canBreathe ? { ...main, drop: 1 as const } : undefined;
  return {
    name,
    main,
    alt,
    isMirrored: isShy ? false : isMirrored,
    animation: canBreathe ? 'breath' : undefined,
  };
}

export function avatarLookOf(agent: AgentLife, isMoving: boolean): AvatarLook {
  if (agent.pose === 'walking') return walkLook(agent, isMoving);
  if (agent.pose === 'seated') return seatedLook(isMoving);
  const coffee = COFFEE_ART[agent.pose];
  if (coffee === undefined) return standLook(agent, isMoving);
  const { view, isMirrored } = coffeeView(agent.face);
  const main: SpriteSpec = { ...IDLE_FRONT, view, arm: coffee.arm, face: coffee.face };
  return { name: coffee.name, main, alt: undefined, isMirrored, animation: undefined };
}
