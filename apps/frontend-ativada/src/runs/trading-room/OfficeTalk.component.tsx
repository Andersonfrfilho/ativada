// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useRef, type ReactElement, type ReactNode } from 'react';

import { FIGURE, type Point } from './office-geometry.js';
import { ROOM_VIEW } from './room-art.js';
import { usePlacement } from './usePlacement.hook.js';
import styles from './Office.module.css';

const CENTER_X = 800;
const BUBBLE_GAP = 10;
const BUBBLE_TOP = { min: 452, max: 620 } as const;
const HAND = { x: 0.8, y: 18 } as const;
const LASER_REACH = 26;

function bubblePoint(spot: Point): Point & { readonly side: 'left' | 'right' } {
  const y = Math.max(BUBBLE_TOP.min, Math.min(spot.y + 8, BUBBLE_TOP.max));
  return spot.x < CENTER_X
    ? { x: spot.x + FIGURE.width + BUBBLE_GAP, y, side: 'left' }
    : { x: spot.x - BUBBLE_GAP, y, side: 'right' };
}

// O balão de quem foi ao telão: a ficha do que ele acha, ou a resposta à pergunta. Fica no piso, nunca sobre o gráfico.
export function OfficeBubble({
  children,
  spot,
}: {
  readonly children: ReactNode;
  readonly spot: Point;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const point = bubblePoint(spot);
  usePlacement(ref, point);
  return (
    <div ref={ref} className={styles.bubble} data-side={point.side} aria-hidden="true">
      {children}
    </div>
  );
}

// O laser sai da mão de quem aponta e termina na borda de baixo da moldura do telão (o alto do piso).
export function OfficeLaser({ spot }: { readonly spot: Point }): ReactElement {
  const handX = spot.x + FIGURE.width * HAND.x;
  const path = `M${handX} ${spot.y + HAND.y}L${handX + LASER_REACH} ${ROOM_VIEW.y}`;
  return (
    <svg
      className={styles.lasers}
      viewBox={`${ROOM_VIEW.x} ${ROOM_VIEW.y} ${ROOM_VIEW.width} ${ROOM_VIEW.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} className={styles.laser} />
    </svg>
  );
}
