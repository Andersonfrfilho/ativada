// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement, RefObject } from 'react';

import { FormingBand } from '../team-room/balcony/FormingBand.component.js';
import { LeaderOverlay } from '../team-room/balcony/LeaderOverlay.component.js';
import type { TradeChart } from '../trade-chart.validation.js';
import type { ChartView } from '../useChartView.hook.js';
import { RunStartMark } from './RunStartMark.component.js';
import type { CandleCanvasModel } from './useCandleCanvasModel.hook.js';

export type CanvasOverlaysProps = {
  readonly runId: string;
  readonly chart: TradeChart;
  readonly view: ChartView;
  readonly model: CandleCanvasModel;
  readonly figureRef: RefObject<HTMLElement | null>;
};

// O que se desenha por cima do canvas: o começo da simulação, a coluna da vela em formação e as linhas do agente em foco.
export function CanvasOverlays({
  runId,
  chart,
  view,
  model,
  figureRef,
}: CanvasOverlaysProps): ReactElement {
  const { surface, containerRef } = model;
  return (
    <>
      <RunStartMark
        surface={surface}
        startedAt={view.isLive ? chart.runRange.from : undefined}
        canvasRef={containerRef}
        figureRef={figureRef}
      />
      <FormingBand
        runId={runId}
        isLive={view.isLive}
        surface={surface}
        canvasRef={containerRef}
        figureRef={figureRef}
      />
      <LeaderOverlay surface={surface} canvasRef={containerRef} figureRef={figureRef} />
    </>
  );
}
