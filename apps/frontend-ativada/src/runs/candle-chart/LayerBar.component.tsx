// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, useState, type ReactElement } from 'react';

import controls from '../../styles/Controls.module.css';
import { CHART_LAYER, type ChartLayer } from './candle-chart.constant.js';
import type { ChartPreferences } from './chart-preferences.js';
import styles from './CandleChart.module.css';

export type LayerBarProps = {
  readonly layers: ChartPreferences['layers'];
  // Previsão e "esperou" só existem na simulação ao vivo.
  readonly isLive: boolean;
  // As camadas da estratégia só existem na vela em que ela decide.
  readonly isStrategyTimeframe: boolean;
  readonly onToggle: (layer: ChartLayer) => void;
};

type LayerItem = {
  readonly layer: ChartLayer;
  readonly label: string;
  readonly isLiveOnly: boolean;
  readonly needsStrategyTimeframe: boolean;
};

const LAYER_ITEMS: readonly LayerItem[] = [
  {
    layer: CHART_LAYER.FORECAST,
    label: 'Previsão',
    isLiveOnly: true,
    needsStrategyTimeframe: true,
  },
  {
    layer: CHART_LAYER.TRADES,
    label: 'Compras e vendas',
    isLiveOnly: false,
    needsStrategyTimeframe: false,
  },
  {
    layer: CHART_LAYER.STRATEGY_LINES,
    label: 'Linhas da estratégia',
    isLiveOnly: false,
    needsStrategyTimeframe: true,
  },
  {
    layer: CHART_LAYER.STOP_TARGET,
    label: 'Stop e alvo',
    isLiveOnly: false,
    needsStrategyTimeframe: false,
  },
  { layer: CHART_LAYER.WAITED, label: 'Esperou', isLiveOnly: true, needsStrategyTimeframe: true },
];

// Botões de alternância com caixa marcada e palavra (nunca só cor), `aria-pressed` e 44 px (RF10). No celular ficam
// recolhidos atrás de "Camadas do gráfico" (a classe esconde a lista abaixo de 640 px enquanto fechada).
type LayerButtonProps = {
  readonly item: LayerItem;
  readonly isOn: boolean;
  readonly isDisabled: boolean;
  readonly onToggle: (layer: ChartLayer) => void;
};

function LayerButton({ item, isOn, isDisabled, onToggle }: LayerButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={`${controls.button} ${isOn && !isDisabled ? styles.pressed : ''}`}
      aria-pressed={isOn}
      disabled={isDisabled}
      onClick={() => onToggle(item.layer)}
    >
      <span aria-hidden="true">{isOn ? '☑' : '☐'}</span>
      {item.label}
    </button>
  );
}

export function LayerBar(props: LayerBarProps): ReactElement {
  const { layers, isLive, isStrategyTimeframe, onToggle } = props;
  const [isOpen, setIsOpen] = useState(false);
  const listId = useId();
  const items = LAYER_ITEMS.filter((item) => isLive || !item.isLiveOnly);
  return (
    <div className={styles.layerBar}>
      <button
        type="button"
        className={`${controls.button} ${styles.layersToggle}`}
        aria-expanded={isOpen}
        aria-controls={listId}
        onClick={() => setIsOpen(!isOpen)}
      >
        Camadas do gráfico
      </button>
      <div
        id={listId}
        className={`${styles.layerList} ${isOpen ? styles.layersOpen : styles.layersClosed}`}
        role="group"
        aria-label="Camadas do gráfico"
      >
        {items.map((item) => (
          <LayerButton
            key={item.layer}
            item={item}
            isOn={layers[item.layer]}
            isDisabled={item.needsStrategyTimeframe && !isStrategyTimeframe}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}
