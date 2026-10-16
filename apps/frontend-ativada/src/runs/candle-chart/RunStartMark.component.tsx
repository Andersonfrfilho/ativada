// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useState, type ReactElement, type RefObject } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { formatTimeInZone } from '../../format/zoned-time.js';
import { toSurfaceTime } from './candle-series.js';
import type { ChartSurface } from './chart-surface.types.js';
import styles from './CandleChart.module.css';

export type RunStartMarkProps = {
  readonly surface: ChartSurface | undefined;
  // O instante (ms) em que a simulação começou; sem ele (ou sem a vela na tela), nada é desenhado.
  readonly startedAt: number | undefined;
  readonly canvasRef: RefObject<HTMLElement | null>;
  readonly figureRef: RefObject<HTMLElement | null>;
};

type Mark = { readonly x: number; readonly top: number; readonly height: number };

function measure({ surface, canvasRef, figureRef }: RunStartMarkProps): Mark | undefined {
  const canvas = canvasRef.current;
  const figure = figureRef.current;
  const anchor = surface?.anchorOf('run_start');
  if (canvas === null || figure === null || anchor === null || anchor === undefined) {
    return undefined;
  }
  const base = figure.getBoundingClientRect();
  const box = canvas.getBoundingClientRect();
  return { x: box.left + anchor.x - base.left, top: box.top - base.top, height: box.height };
}

function useMark(props: RunStartMarkProps): Mark | undefined {
  const { surface, startedAt } = props;
  const [mark, setMark] = useState<Mark | undefined>(undefined);
  useEffect(() => {
    surface?.setRunStart(startedAt === undefined ? null : toSurfaceTime(startedAt));
    let frame = 0;
    const update = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setMark(measure(props)));
    };
    update();
    const stop = surface?.onVisibleRangeChange(update);
    globalThis.addEventListener('resize', update);
    return (): void => {
      cancelAnimationFrame(frame);
      stop?.();
      globalThis.removeEventListener('resize', update);
    };
  }, [surface, startedAt, props]);
  return mark;
}

// A linha vertical "a simulação começa aqui, às HH:MM": o que vem antes é só contexto, sem decisão da estratégia.
export function RunStartMark(props: RunStartMarkProps): ReactElement | null {
  const timeZone = useUserTimeZone();
  const mark = useMark(props);
  if (mark === undefined || props.startedAt === undefined) return null;
  const label = `a simulação começa aqui, às ${formatTimeInZone(props.startedAt, timeZone)}`;
  return (
    <svg className={styles.runStart} aria-hidden="true" focusable="false" data-run-start="">
      <line
        className={styles.runStartLine}
        x1={mark.x}
        x2={mark.x}
        y1={mark.top}
        y2={mark.top + mark.height}
      />
      <text className={styles.runStartLabel} x={mark.x + 6} y={mark.top + 14}>
        {label}
      </text>
    </svg>
  );
}
