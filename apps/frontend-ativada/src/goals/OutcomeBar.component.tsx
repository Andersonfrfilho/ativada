// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './Goals.module.css';
import { describeOutcomeBar, type OutcomeSegments } from './outcome-bar.js';

export type OutcomeBarProps = { readonly segments: OutcomeSegments };

const BAR_HEIGHT = 12;

type SegmentProps = {
  readonly className: string | undefined;
  readonly start: number;
  readonly width: number;
};

function Segment({ className, start, width }: SegmentProps): ReactElement {
  return <rect className={className} x={start} y={0} width={width} height={BAR_HEIGHT} />;
}

export function OutcomeBar({ segments }: OutcomeBarProps): ReactElement {
  return (
    <div>
      <svg
        className={styles.outcomeBar}
        viewBox={`0 0 100 ${BAR_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={describeOutcomeBar(segments)}
      >
        <Segment className={styles.barReached} start={0} width={segments.reached} />
        <Segment className={styles.barStopped} start={segments.reached} width={segments.stopped} />
        <Segment
          className={styles.barNeither}
          start={segments.reached + segments.stopped}
          width={segments.neither}
        />
      </svg>
      <ul className={styles.barLegend} aria-hidden="true">
        <li className={styles.legendReached}>Chegou ao alvo</li>
        <li className={styles.legendStopped}>Bateu a perda máxima</li>
        <li className={styles.legendNeither}>Nenhum dos dois</li>
      </ul>
    </div>
  );
}
