// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement } from 'react';

import { formatDecimalText } from '../../format/decimal.js';
import { buildScoreScale, type ScoreScale } from './scoreboard-scale.js';
import styles from './LiveTracking.module.css';

const MINUS = '−';
const POINT_FORMAT = { minimumFraction: 0, maximumFraction: 2 } as const;
const EDGE_PERCENT = 14;
const TRACK_TOP = 34;
const TRACK_HEIGHT = 14;

export type ScoreboardRulerProps = {
  readonly score: string;
  readonly threshold: string;
  readonly weights: readonly string[];
  readonly verb: string;
};

export function formatScorePoints(text: string, hasSign: boolean): string {
  const formatted = formatDecimalText(text, POINT_FORMAT).replace('-', MINUS);
  return hasSign && !formatted.startsWith(MINUS) && formatted !== '0' ? `+${formatted}` : formatted;
}

type Anchor = 'start' | 'middle' | 'end';

function anchorOf(percent: number): Anchor {
  if (percent < EDGE_PERCENT) return 'start';
  return percent > 100 - EDGE_PERCENT ? 'end' : 'middle';
}

// A zona-alvo é hachurada: preenchida até o limiar a faixa parecia "quase lá" quando ainda faltava chegar.
function Track({ scale }: { readonly scale: ScoreScale }): ReactElement {
  const patternId = useId();
  const isRight = scale.thresholdPercent >= 50;
  const zoneStart = isRight ? scale.thresholdPercent : 0;
  const zoneWidth = isRight ? 100 - scale.thresholdPercent : scale.thresholdPercent;
  return (
    <>
      <defs>
        <pattern
          id={patternId}
          patternUnits="userSpaceOnUse"
          width="7"
          height="7"
          patternTransform="rotate(45)"
        >
          <line className={styles.scoreHatch} x1="0" y1="0" x2="0" y2="7" />
        </pattern>
      </defs>
      <rect
        className={styles.scoreTrack}
        x="0"
        y={TRACK_TOP}
        width="100%"
        height={TRACK_HEIGHT}
        rx="7"
      />
      <rect
        className={styles.scoreZone}
        fill={`url(#${patternId})`}
        x={`${zoneStart}%`}
        y={TRACK_TOP}
        width={`${zoneWidth}%`}
        height={TRACK_HEIGHT}
        rx="7"
      />
    </>
  );
}

function Marks({ scale }: { readonly scale: ScoreScale }): ReactElement {
  return (
    <>
      <line
        className={`${styles.scoreMark} ${styles.scoreThreshold}`}
        x1={`${scale.thresholdPercent}%`}
        x2={`${scale.thresholdPercent}%`}
        y1="26"
        y2="56"
      />
      <line
        className={styles.scoreMark}
        x1={`${scale.scorePercent}%`}
        x2={`${scale.scorePercent}%`}
        y1="26"
        y2="56"
      />
    </>
  );
}

function Ticks({ limit }: { readonly limit: number }): ReactElement {
  return (
    <>
      <text className={styles.scoreTick} x="0" y="91" textAnchor="start">{`${MINUS}${limit}`}</text>
      <text className={styles.scoreTick} x="50%" y="91" textAnchor="middle">
        0
      </text>
      <text className={styles.scoreTick} x="100%" y="91" textAnchor="end">{`+${limit}`}</text>
    </>
  );
}

// A régua do placar: onde a pontuação está agora (marca escura) e a partir de onde a regra age (marca verde com a zona).
export function ScoreboardRuler(props: ScoreboardRulerProps): ReactElement | null {
  const scale = buildScoreScale(props);
  if (scale === undefined) return null;
  const scoreText = formatScorePoints(props.score, false);
  const thresholdText = formatScorePoints(props.threshold, true);
  return (
    <svg
      className={styles.scoreboard}
      role="img"
      aria-label={`Pontuação ${scoreText}; ${props.verb} a partir de ${thresholdText}`}
    >
      <Track scale={scale} />
      <Marks scale={scale} />
      <text
        className={styles.scoreLabel}
        x={`${scale.scorePercent}%`}
        y="16"
        textAnchor={anchorOf(scale.scorePercent)}
      >
        {`agora ${scoreText}`}
      </text>
      <text
        className={styles.scoreLabelThreshold}
        x={`${scale.thresholdPercent}%`}
        y="76"
        textAnchor={anchorOf(scale.thresholdPercent)}
      >
        {`${props.verb} a partir de ${thresholdText}`}
      </text>
      <Ticks limit={scale.limit} />
    </svg>
  );
}
