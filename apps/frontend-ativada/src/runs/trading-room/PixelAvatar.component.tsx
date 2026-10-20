// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { avatarPoses } from './avatar-poses.js';
import { AVATAR_HEIGHT, AVATAR_WIDTH, type AvatarWho, type PixelRun } from './pixel-avatar.js';
import styles from './Office.module.css';

function Layer({
  runs,
  className,
}: {
  readonly runs: readonly PixelRun[];
  readonly className: string | undefined;
}): ReactElement {
  return (
    <g className={className}>
      {runs.map((run) => (
        <rect
          key={`${run.x}-${run.y}`}
          x={run.x}
          y={run.y}
          width={run.w}
          height={1}
          fill={`var(--px-${run.color})`}
        />
      ))}
    </g>
  );
}

// O avatar em pixel art: as três poses no mesmo desenho; o CSS mostra a da hora pelo `data-pose` do agente.
export function PixelAvatar({ who }: { readonly who: AvatarWho }): ReactElement {
  const poses = avatarPoses(who);
  return (
    <svg
      className={styles.avatar}
      data-who={who}
      viewBox={`0 0 ${AVATAR_WIDTH} ${AVATAR_HEIGHT}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <Layer runs={poses.idle} className={styles.poseIdle} />
      <Layer runs={poses.step} className={styles.poseStep} />
      <Layer runs={poses.point} className={styles.posePoint} />
    </svg>
  );
}
