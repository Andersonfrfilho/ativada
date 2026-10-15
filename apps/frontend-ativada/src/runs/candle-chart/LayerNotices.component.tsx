// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import controls from '../../styles/Controls.module.css';
import type { TradeChart } from '../trade-chart.validation.js';
import { CHART_LAYER, type ChartLayer } from './candle-chart.constant.js';
import styles from './CandleChart.module.css';
import { describeScorePanel } from './layer-series.js';
import type { ChartLayerData } from './useChartLayers.hook.js';

export type LayerNoticesProps = {
  readonly data: ChartLayerData;
  readonly decisions: TradeChart['decisions'];
  readonly isOn: (layer: ChartLayer) => boolean;
  readonly isLive: boolean;
};

const NO_PRICE_LINES = 'Esta estratégia não usa linhas sobre o preço';
const LAYERS_FAILED =
  'Não foi possível carregar o placar e as linhas da estratégia; as velas e as operações continuam.';
const ZOOM_FOR_DECISIONS = 'Aproxime o gráfico para ver cada decisão';
const FORECAST_NARROW =
  'A previsão vale para uma vela só, por isso o cone é estreito aqui; a leitura clara está em "Próxima vela de perto".';

// O texto das camadas: cada linha da estratégia pelo nome, o que o painel do placar mostra e o motivo de uma camada
// estar vazia ou ter falhado. A falha das camadas NUNCA tira as velas da tela.
export function LayerNotices({ data, decisions, isOn, isLive }: LayerNoticesProps): ReactElement {
  const { layers } = data;
  const lines = isOn(CHART_LAYER.STRATEGY_LINES) ? layers?.lines : undefined;
  const isWaitedOnWithoutData =
    isLive && isOn(CHART_LAYER.WAITED) && data.isStrategyTimeframe && decisions === null;
  return (
    <div className={styles.notices}>
      {data.hasLayersFailed ? (
        <p className={controls.muted} role="status">
          {LAYERS_FAILED}
        </p>
      ) : null}
      {lines === undefined || lines.length > 0 ? null : (
        <p className={controls.muted}>{NO_PRICE_LINES}</p>
      )}
      {lines === undefined || lines.length === 0 ? null : (
        <ul className={styles.lineLegend} aria-label="Linhas da estratégia sobre o preço">
          {lines.map((line) => (
            <li key={line.key}>{line.label}</li>
          ))}
        </ul>
      )}
      {layers === undefined ? null : (
        <p className={controls.muted}>{describeScorePanel(layers.thresholds)}</p>
      )}
      {isWaitedOnWithoutData ? <p className={controls.muted}>{ZOOM_FOR_DECISIONS}</p> : null}
      {isLive && isOn(CHART_LAYER.FORECAST) && data.projection !== undefined ? (
        <p className={controls.muted}>{FORECAST_NARROW}</p>
      ) : null}
    </div>
  );
}
