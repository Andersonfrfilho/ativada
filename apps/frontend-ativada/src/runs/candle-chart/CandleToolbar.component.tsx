// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import type { TradeChart } from '../trade-chart.validation.js';
import { toSurfaceTime } from './candle-series.js';
import { ChartToolbar } from './ChartToolbar.component.js';
import { useChartPeriod } from './useChartPeriod.hook.js';
import { useRememberedRetention } from './useRememberedRetention.hook.js';
import type { CandleCanvasModel } from './useCandleCanvasModel.hook.js';
import type { CandleSource } from './useCandleSource.hook.js';

export type CandleToolbarProps = {
  readonly chart: TradeChart;
  readonly source: CandleSource;
  readonly model: CandleCanvasModel;
};

// A barra do gráfico ligada ao estado da tela; "Ir ao início da simulação" só existe com vela de exibição, onde o começo
// fica longe da ponta.
export function CandleToolbar({ chart, source, model }: CandleToolbarProps): ReactElement {
  const { surface } = model;
  const retention = useRememberedRetention(source.retentionStart, source.timeframe);
  const unavailableOptions = source.timeframeOptions.filter((option) => {
    const start = retention[option];
    return start !== undefined && chart.runRange.to < start;
  });
  const period = useChartPeriod({ source, surface, endTime: chart.runRange.to });
  return (
    <ChartToolbar
      period={period}
      timeframe={source.timeframe}
      options={source.timeframeOptions}
      runTimeframe={chart.timeframe}
      surface={surface}
      unavailableOptions={unavailableOptions}
      isTooltipOn={source.preferences.preferences.isTooltipOn}
      onToggleTooltip={source.preferences.toggleTooltip}
      onTimeframeChange={(next) => {
        period.clear();
        model.handleTimeframeChange(next);
      }}
      onGoToStart={
        source.displayMapping === undefined
          ? undefined
          : (): void => surface?.centerOn(toSurfaceTime(chart.runRange.from))
      }
    />
  );
}
