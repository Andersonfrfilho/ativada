// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import type { ArtRect } from './room-art.js';
import styles from './Office.module.css';

const BLINK_CLASS = [styles.blink0, styles.blink1, styles.blink2] as const;

// Os retângulos de um desenho em pixel art: a cor é sempre um token (atributo `fill`, nunca estilo em linha).
export function ArtRects({ rects }: { readonly rects: readonly ArtRect[] }): ReactElement {
  return (
    <>
      {rects.map((rect, index) => (
        <rect
          key={`${rect.x}-${rect.y}-${index}`}
          x={rect.x}
          y={rect.y}
          width={rect.w}
          height={rect.h}
          fill={`var(${rect.fill})`}
          className={rect.blink === undefined ? undefined : BLINK_CLASS[rect.blink]}
        />
      ))}
    </>
  );
}
