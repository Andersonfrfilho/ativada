// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { ArtRects } from './ArtRects.component.js';
import { machineLookOf } from './office-coffee.js';
import type { AgentLife, LifeState } from './office-life.types.js';
import { buildCoffeeFx, buildPuddle } from './coffee-corner-art.js';
import { ROOM_VIEW } from './room-art.js';
import styles from './Office.module.css';

const VIEW_BOX = `${ROOM_VIEW.x} ${ROOM_VIEW.y} ${ROOM_VIEW.width} ${ROOM_VIEW.height}`;

// A máquina de café ganha vida por cima do cenário: o botão acende quando alguém aperta e a caneca aparece no bico.
export function CoffeeMachineFx({
  agents,
  puddle,
}: {
  readonly agents: readonly AgentLife[];
  readonly puddle: LifeState['puddle'];
}): ReactElement {
  const look = machineLookOf(agents);
  return (
    <>
      <svg
        className={styles.roomArt}
        data-machine={look}
        viewBox={VIEW_BOX}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        aria-hidden="true"
        focusable="false"
      >
        <ArtRects rects={buildCoffeeFx(look)} />
      </svg>
      {puddle === undefined ? null : (
        <svg
          className={`${styles.roomArt} ${styles.puddle}`}
          data-fading={puddle.steps <= 3 ? 'true' : undefined}
          viewBox={VIEW_BOX}
          preserveAspectRatio="none"
          shapeRendering="crispEdges"
          aria-hidden="true"
          focusable="false"
        >
          <ArtRects rects={buildPuddle(puddle.at)} />
        </svg>
      )}
    </>
  );
}
