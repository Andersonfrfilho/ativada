// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useState, type ReactElement, type RefObject } from 'react';

import type { ChartSurface } from '../../candle-chart/chart-surface.types.js';
import { LEADER_ANCHOR } from './balcony.constant.js';
import styles from './Balcony.module.css';
import { useLeaderFocus } from './leader-focus.context.js';

export type Line = {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
};

export type LeaderOverlayProps = {
  readonly surface: ChartSurface | undefined;
  // O contêiner do gráfico (o canvas) e a figura que guarda tudo: as coordenadas saem da diferença entre os dois.
  readonly canvasRef: RefObject<HTMLElement | null>;
  readonly figureRef: RefObject<HTMLElement | null>;
};

export function measureLeader(
  props: LeaderOverlayProps,
  element: HTMLElement,
  kind: string,
): Line | undefined {
  const { surface, canvasRef, figureRef } = props;
  const canvas = canvasRef.current;
  const figure = figureRef.current;
  const anchorKind = LEADER_ANCHOR[kind];
  if (surface === undefined || canvas === null || figure === null || anchorKind === undefined) {
    return undefined;
  }
  const point = surface.anchorOf(anchorKind);
  if (point === null) return undefined;
  const base = figure.getBoundingClientRect();
  const from = element.getBoundingClientRect();
  const target = canvas.getBoundingClientRect();
  return {
    x1: from.left + from.width / 2 - base.left,
    y1: from.bottom - base.top,
    x2: target.left + point.x - base.left,
    y2: target.top + point.y - base.top,
  };
}

// Refaz a conta só ao mudar o foco, a faixa visível, a rolagem ou o tamanho, um quadro por vez.
function useLeaderLine(props: LeaderOverlayProps): Line | undefined {
  const focus = useLeaderFocus()?.focus;
  const [line, setLine] = useState<Line | undefined>(undefined);
  const { surface } = props;
  useEffect(() => {
    if (focus === undefined) {
      setLine(undefined);
      return undefined;
    }
    let frame = 0;
    const update = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setLine(measureLeader(props, focus.element, focus.slot)));
    };
    update();
    const stop = surface?.onVisibleRangeChange(update);
    globalThis.addEventListener('scroll', update, true);
    globalThis.addEventListener('resize', update);
    return (): void => {
      cancelAnimationFrame(frame);
      stop?.();
      globalThis.removeEventListener('scroll', update, true);
      globalThis.removeEventListener('resize', update);
    };
  }, [focus, surface, props]);
  return line;
}

// A linha tracejada fina, com seta, do balão do agente em foco até o ponto do gráfico que ele comenta (uma por vez; some em janela baixa).
export function LeaderOverlay(props: LeaderOverlayProps): ReactElement | null {
  const line = useLeaderLine(props);
  if (line === undefined) return null;
  return (
    <svg className={styles.leader} aria-hidden="true" focusable="false">
      <defs>
        <marker
          id="leader-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path className={styles.leaderArrow} d="M0 0L8 4L0 8z" />
        </marker>
      </defs>
      <line className={styles.leaderLine} {...line} markerEnd="url(#leader-arrow)" />
    </svg>
  );
}
