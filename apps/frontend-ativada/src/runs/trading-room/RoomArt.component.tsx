// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement } from 'react';

import type { BalconySlot } from '../team-room/balcony/balcony.constant.js';
import { ArtRects } from './ArtRects.component.js';
import { DESKS, seatOf } from './office-geometry.js';
import { buildRoomArt, chair, ROOM_VIEW, TILE, WALL_BOTTOM } from './room-art.js';
import styles from './Office.module.css';

const ROOM_RECTS = buildRoomArt();
const VIEW_BOX = `${ROOM_VIEW.x} ${ROOM_VIEW.y} ${ROOM_VIEW.width} ${ROOM_VIEW.height}`;
const CHAIR_DROP = 36;

function Chairs({ crew }: { readonly crew: readonly BalconySlot[] }): ReactElement {
  const chairs = crew
    .filter((who) => DESKS[who] !== undefined)
    .flatMap((who) => {
      const seat = seatOf(who);
      return chair(seat.x, seat.y + CHAIR_DROP);
    });
  return <ArtRects rects={chairs} />;
}

// O piso da sala em pixel art (decorativo): ladrilhos em xadrez por `<pattern>`, lambri, tapete, móveis e as cadeiras de
// quem tem mesa. O telão não está aqui: fica acima, numa moldura própria.
export function RoomArt({ crew }: { readonly crew: readonly BalconySlot[] }): ReactElement {
  const tiles = useId();
  return (
    <svg
      className={styles.roomArt}
      viewBox={VIEW_BOX}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern
          id={tiles}
          width={TILE * 2}
          height={TILE * 2}
          patternUnits="userSpaceOnUse"
          y={WALL_BOTTOM}
        >
          <rect width={TILE * 2} height={TILE * 2} fill="var(--room-tile-a)" />
          <rect width={TILE} height={TILE} x={TILE} fill="var(--room-tile-b)" />
          <rect width={TILE} height={TILE} y={TILE} fill="var(--room-tile-b)" />
        </pattern>
      </defs>
      <rect
        x={0}
        y={WALL_BOTTOM}
        width={ROOM_VIEW.width}
        height={ROOM_VIEW.y + ROOM_VIEW.height - WALL_BOTTOM}
        fill={`url(#${tiles})`}
      />
      <ArtRects rects={ROOM_RECTS} />
      <Chairs crew={crew} />
    </svg>
  );
}
