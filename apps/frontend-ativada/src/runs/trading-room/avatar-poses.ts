// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Pose } from './office-life.types.js';
import {
  createPainter,
  emptyGrid,
  outline,
  toRuns,
  type AvatarPoses,
  type AvatarWho,
  type PixelRun,
} from './pixel-avatar.js';
import {
  paintArm,
  type ArmMode,
  paintBackHair,
  paintBody,
  paintHead,
  paintLegs,
  paintStyle,
  paintTongue,
} from './pixel-avatar-parts.js';

type Variant = { readonly isStep: boolean; readonly arm: ArmMode };

function drawLayer(who: AvatarWho, variant: Variant): readonly PixelRun[] {
  const grid = emptyGrid();
  const paint = createPainter(grid);
  paintBackHair(paint, who);
  paintLegs(paint, variant.isStep);
  paintBody(paint);
  paintArm(paint, variant.arm);
  paintHead(paint);
  if (variant.arm === 'burn') paintTongue(paint);
  paintStyle(paint, who);
  return toRuns(outline(grid));
}

const CACHE = new Map<AvatarWho, AvatarPoses>();

// As camadas de cada avatar (parado, passo, apontando e, com a caneca, parado, passo e bebendo); o mesmo agente dá sempre o mesmo desenho.
export function avatarPoses(who: AvatarWho): AvatarPoses {
  const cached = CACHE.get(who);
  if (cached !== undefined) return cached;
  const poses: AvatarPoses = {
    idle: drawLayer(who, { isStep: false, arm: 'down' }),
    step: drawLayer(who, { isStep: true, arm: 'down' }),
    point: drawLayer(who, { isStep: false, arm: 'up' }),
    hold: drawLayer(who, { isStep: false, arm: 'hold' }),
    holdStep: drawLayer(who, { isStep: true, arm: 'hold' }),
    sip: drawLayer(who, { isStep: false, arm: 'sip' }),
    burn: drawLayer(who, { isStep: false, arm: 'burn' }),
    blow: drawLayer(who, { isStep: false, arm: 'blow' }),
    tilt: drawLayer(who, { isStep: false, arm: 'tilt' }),
  };
  CACHE.set(who, poses);
  return poses;
}

export type AvatarLook =
  'idle' | 'walk' | 'point' | 'hold' | 'walk-hold' | 'sip' | 'burn' | 'blow' | 'tilt';

// Qual camada aparece: depende da pose e de o boneco estar com a caneca na mão.
export function avatarLookOf(pose: Pose, hasCup: boolean): AvatarLook {
  if (pose === 'walking') return hasCup ? 'walk-hold' : 'walk';
  if (pose === 'pointing' || pose === 'pressing' || pose === 'taking') return 'point';
  if (pose === 'drinking') return 'sip';
  if (pose === 'burning') return 'burn';
  if (pose === 'blowing') return 'blow';
  if (pose === 'spilling') return 'tilt';
  return hasCup ? 'hold' : 'idle';
}
