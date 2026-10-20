// Copyright (c) 2026 Ada Technology. All rights reserved.
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
  paintBackHair,
  paintBody,
  paintHead,
  paintLegs,
  paintStyle,
} from './pixel-avatar-parts.js';

type Variant = { readonly isStep: boolean; readonly isUp: boolean };

function drawLayer(who: AvatarWho, variant: Variant): readonly PixelRun[] {
  const grid = emptyGrid();
  const paint = createPainter(grid);
  paintBackHair(paint, who);
  paintLegs(paint, who, variant.isStep);
  paintBody(paint, who);
  paintArm(paint, who, variant.isUp);
  paintHead(paint, who);
  paintStyle(paint, who);
  return toRuns(outline(grid));
}

const CACHE = new Map<AvatarWho, AvatarPoses>();

// As três camadas de cada avatar (parado, passo e apontando); o mesmo agente dá sempre o mesmo desenho.
export function avatarPoses(who: AvatarWho): AvatarPoses {
  const cached = CACHE.get(who);
  if (cached !== undefined) return cached;
  const poses: AvatarPoses = {
    idle: drawLayer(who, { isStep: false, isUp: false }),
    step: drawLayer(who, { isStep: true, isUp: false }),
    point: drawLayer(who, { isStep: false, isUp: true }),
  };
  CACHE.set(who, poses);
  return poses;
}
