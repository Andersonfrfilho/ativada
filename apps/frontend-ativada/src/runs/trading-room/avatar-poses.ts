// Copyright (c) 2026 Ada Technology. All rights reserved.
import { paintFrontBackHair, paintFrontStyle } from './pixel-avatar-parts.js';
import {
  createPainter,
  emptyGrid,
  outline,
  shiftPainter,
  toRuns,
  type AvatarWho,
  type Painter,
  type PixelRun,
} from './pixel-avatar.js';
import { paintFarArm, paintNearArm } from './sprite-arms.js';
import { paintLegs, paintTorso } from './sprite-body.js';
import { paintBackHair, paintHairBehind } from './sprite-hair.js';
import { paintEar, paintFace, paintHead } from './sprite-head.js';
import { PROFILES, type SpriteSpec } from './sprite-types.js';

function paintUpperFront(paint: Painter, who: AvatarWho, spec: SpriteSpec): void {
  paintHead(paint, spec.view);
  paintFace(paint, spec.view, spec.face);
  paintFrontStyle(paint, who, spec.view);
}

function paintUpperBack(paint: Painter, who: AvatarWho, spec: SpriteSpec): void {
  if (spec.view !== 'e' && spec.view !== 'ne' && spec.view !== 'n') return;
  paintHead(paint, spec.view);
  paintFace(paint, spec.view, spec.face);
  paintBackHair(paint, PROFILES[who], spec.view);
  paintEar(paint, spec.view);
}

function draw(who: AvatarWho, spec: SpriteSpec): readonly PixelRun[] {
  const grid = emptyGrid();
  const base = createPainter(grid);
  const upper = shiftPainter(base, 0, spec.drop);
  const isFront = spec.view === 's' || spec.view === 'se';
  if (isFront) paintFrontBackHair(upper, who);
  else if (spec.view === 'e') paintHairBehind(upper, PROFILES[who], 'e');
  paintLegs(base, spec.view, spec.legs);
  paintFarArm(upper, spec);
  paintTorso(upper, spec.view);
  if (isFront) paintUpperFront(upper, who, spec);
  else paintUpperBack(upper, who, spec);
  paintNearArm(upper, spec);
  return toRuns(outline(grid));
}

const CACHE = new Map<string, readonly PixelRun[]>();

export function spriteKeyOf(spec: SpriteSpec): string {
  return [spec.view, spec.legs, spec.drop, spec.arm, spec.swing, spec.face, spec.alt].join(':');
}

// O desenho de um quadro; o mesmo agente e o mesmo quadro dão sempre o mesmo desenho (guardado).
export function spriteOf(who: AvatarWho, spec: SpriteSpec): readonly PixelRun[] {
  const key = `${who}|${spriteKeyOf(spec)}`;
  const cached = CACHE.get(key);
  if (cached !== undefined) return cached;
  const runs = draw(who, spec);
  CACHE.set(key, runs);
  return runs;
}

export const IDLE_FRONT: SpriteSpec = {
  view: 's',
  legs: 'stand',
  drop: 0,
  arm: 'down',
  swing: 1,
  face: 'plain',
  alt: false,
};
