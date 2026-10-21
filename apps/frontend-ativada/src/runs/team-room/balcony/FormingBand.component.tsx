// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useState, type ReactElement, type RefObject } from 'react';

import { useUserTimeZone } from '../../../account/useUserTimeZone.hook.js';
import { formatTimeInZone } from '../../../format/zoned-time.js';
import type { ChartSurface } from '../../candle-chart/chart-surface.types.js';
import { useLiveStatusQuery } from '../../live-tracking/live-status.query.js';
import { BALCONY_TEXT } from './balcony.constant.js';
import styles from './Balcony.module.css';

export type FormingBandProps = {
  readonly runId: string;
  readonly isLive: boolean;
  readonly surface: ChartSurface | undefined;
  readonly canvasRef: RefObject<HTMLElement | null>;
  readonly figureRef: RefObject<HTMLElement | null>;
};

export type BandBox = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

// A faixa da vela em formação nas coordenadas da figura: as bordas vêm da superfície; a altura é a do canvas.
export function measureBand(props: FormingBandProps): BandBox | undefined {
  const { surface, canvasRef, figureRef } = props;
  const canvas = canvasRef.current;
  const figure = figureRef.current;
  if (surface === undefined || canvas === null || figure === null) return undefined;
  const left = surface.anchorOf('forming_left');
  const right = surface.anchorOf('forming_right');
  if (left === null || right === null) return undefined;
  const base = figure.getBoundingClientRect();
  const box = canvas.getBoundingClientRect();
  const width = Math.max(right.x - left.x, 0);
  return { x: box.left + left.x - base.left, y: box.top - base.top, width, height: box.height };
}

function useBand(props: FormingBandProps): BandBox | undefined {
  const [band, setBand] = useState<BandBox | undefined>(undefined);
  const { surface, isLive } = props;
  useEffect(() => {
    if (!isLive) {
      setBand(undefined);
      return undefined;
    }
    let frame = 0;
    const update = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setBand(measureBand(props)));
    };
    update();
    const stop = surface?.onVisibleRangeChange(update);
    globalThis.addEventListener('resize', update);
    return (): void => {
      cancelAnimationFrame(frame);
      stop?.();
      globalThis.removeEventListener('resize', update);
    };
  }, [isLive, surface, props]);
  return band;
}

// A coluna sombreada da vela em formação, com "opiniões valem até HH:MM" (o fechamento que o servidor informou).
export function FormingBand(props: FormingBandProps): ReactElement | null {
  const timeZone = useUserTimeZone();
  const nextDecisionAt = useLiveStatusQuery(props.runId, props.isLive).data?.run.nextDecisionAt;
  const band = useBand(props);
  if (band === undefined || nextDecisionAt === null || nextDecisionAt === undefined) return null;
  const label = `${BALCONY_TEXT.OPINIONS_VALID_UNTIL} ${formatTimeInZone(nextDecisionAt, timeZone)}`;
  return (
    <svg className={styles.leader} aria-hidden="true" focusable="false" data-forming-band="">
      <rect className={styles.bandRect} {...band} />
      <text className={styles.bandLabel} x={band.x + band.width / 2} y={band.y + 12}>
        {label}
      </text>
    </svg>
  );
}
