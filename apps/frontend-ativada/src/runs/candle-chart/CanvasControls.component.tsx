// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useEnabledTeamKeys } from '../model-teams/useEnabledTeamKeys.hook.js';
import type { CanvasViewProps } from './CanvasParts.component.js';
import { CandleToolbar } from './CandleToolbar.component.js';
import { LayerBar } from './LayerBar.component.js';
import { LiveCandleNotice } from './LiveCandleNotice.component.js';
import { TimeframeNotice } from './TimeframeNotice.component.js';

// A vela, o zoom, o balão de valores e as camadas; no telão o CSS os põe numa faixa fina (rótulos só para o leitor de tela).
export function CanvasControls(props: CanvasViewProps): ReactElement {
  const { runId, chart, view, source, model } = props;
  const teamKeys = useEnabledTeamKeys(runId, view.isLive);
  return (
    <>
      <CandleToolbar chart={chart} source={source} model={model} />
      <LayerBar
        layers={source.preferences.preferences.layers}
        isLive={view.isLive}
        isStrategyTimeframe={model.layerData.isStrategyTimeframe}
        hasTeams={teamKeys !== undefined && teamKeys.length > 0}
        onToggle={source.preferences.toggleLayer}
      />
    </>
  );
}

// Os avisos da vela: vela de exibição menor que a da execução (frase fixa da spec 017) e a vela em formação.
export function CanvasNotices({ chart, source, model }: CanvasViewProps): ReactElement {
  return (
    <>
      <TimeframeNotice
        timeframe={source.timeframe}
        runTimeframe={chart.timeframe}
        displayMapping={source.displayMapping}
        hasRetentionCut={
          source.retentionStart !== undefined && chart.runRange.from < source.retentionStart
        }
      />
      <LiveCandleNotice live={model.live} />
    </>
  );
}
