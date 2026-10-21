// Copyright (c) 2026 Ada Technology. All rights reserved.
import { paintStrokes, type Painter, type Stroke } from './pixel-avatar.js';
import { COFFEE_ARMS, FAR_ARM_SIDE } from './sprite-coffee-arms.js';
import type { ArmMode, SpriteSpec } from './sprite-types.js';

// Os braços: o de trás é pintado antes do tronco (de lado ele some atrás do corpo), o da frente depois da cabeça. Na
// caminhada os braços balançam ao contrário das pernas.
type Side = 'near' | 'far';

const arm = (x: number, y: number, length: number): readonly Stroke[] => [
  [[x, y, 2, length], 'cloth-d'],
  [[x, y + length, 2, 1], 'skin'],
];

function frontArm(x: number, swing: 1 | -1 | 0): readonly Stroke[] {
  if (swing === 1) return arm(x, 15, 5);
  if (swing === -1) {
    const out = x > 9 ? 1 : -1;
    return [
      [[x, 15, 2, 6], 'cloth-d'],
      [[x + out, 21, 2, 1], 'skin'],
    ];
  }
  return arm(x, 15, 6);
}

function sideArm(side: Side, swing: 1 | -1 | 0): readonly Stroke[] {
  const forward = side === 'near' ? swing : -swing;
  if (side === 'near' && forward === 0) return arm(9, 15, 6);
  if (side === 'far' && forward === 0) return [];
  if (forward === 1) {
    const x = side === 'near' ? 10 : 12;
    return [
      [[x, 15, 2, 3], 'cloth-d'],
      [[x + 1, 18, 2, 2], 'cloth-d'],
      [[x + 2, 20, 2, 1], 'skin'],
    ];
  }
  const x = side === 'near' ? 9 : 6;
  return [
    [[x, 15, 2, 3], 'cloth-d'],
    [[x - 1, 18, 2, 2], 'cloth-d'],
    [[x - 2, 20, 2, 1], 'skin'],
  ];
}

const POINT: readonly Stroke[] = [
  [[14, 7, 2, 8], 'cloth-d'],
  [[14, 5, 2, 2], 'skin'],
];

function typing(alt: boolean): readonly Stroke[] {
  return [
    [[4, 15, 2, 3], 'cloth-d'],
    [[14, 15, 2, 3], 'cloth-d'],
    [[6, 18, 2, 1], 'cloth-d'],
    [[12, 18, 2, 1], 'cloth-d'],
    [[7, alt ? 18 : 19, 2, 1], 'skin'],
    [[11, alt ? 19 : 18, 2, 1], 'skin'],
  ];
}

function swingOf(spec: SpriteSpec): 1 | -1 | 0 {
  return spec.arm === 'swing' ? spec.swing : 0;
}

// O braço de trás (de lado, atrás do corpo; de frente, o do outro lado do tronco).
export function paintFarArm(paint: Painter, spec: SpriteSpec): void {
  if (spec.arm === 'type') return;
  const isFree = spec.arm === 'swing' || spec.arm === 'down';
  const swing = isFree ? swingOf(spec) : 0;
  if (spec.view === 'e') paintStrokes(paint, isFree ? sideArm('far', swing) : FAR_ARM_SIDE);
  else paintStrokes(paint, frontArm(4, swing === 0 ? 0 : swing === 1 ? -1 : 1));
}

function nearArm(spec: SpriteSpec): readonly Stroke[] {
  const mode: ArmMode = spec.arm;
  if (mode === 'point') return POINT;
  if (mode === 'type') return typing(spec.alt);
  if (mode === 'down' || mode === 'swing') {
    return spec.view === 'e' ? sideArm('near', swingOf(spec)) : frontArm(14, swingOf(spec));
  }
  return COFFEE_ARMS[spec.view === 'e' ? 'side' : 'front'][mode];
}

export function paintNearArm(paint: Painter, spec: SpriteSpec): void {
  paintStrokes(paint, nearArm(spec));
}
