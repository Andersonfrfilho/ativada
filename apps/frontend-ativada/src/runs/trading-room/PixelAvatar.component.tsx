// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import type { AvatarLook } from './avatar-look.js';
import { spriteKeyOf, spriteOf } from './avatar-poses.js';
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
          className={run.color === 'steam' ? styles.steamPixel : undefined}
        />
      ))}
    </g>
  );
}

// O avatar em pixel art: o quadro da hora e, com movimento, o quadro seguinte que o CSS alterna (passo, respiração,
// digitação). A chave muda a cada quadro novo para a alternância recomeçar junto com o passo.
export function PixelAvatar({
  who,
  look,
}: {
  readonly who: AvatarWho;
  readonly look: AvatarLook;
}): ReactElement {
  return (
    <svg
      key={`${spriteKeyOf(look.main)}|${look.alt === undefined ? '' : spriteKeyOf(look.alt)}`}
      className={styles.avatar}
      data-who={who}
      viewBox={`0 0 ${AVATAR_WIDTH} ${AVATAR_HEIGHT}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <Layer runs={spriteOf(who, look.main)} className={styles.frameA} />
      {look.alt === undefined ? null : (
        <Layer runs={spriteOf(who, look.alt)} className={styles.frameB} />
      )}
    </svg>
  );
}
