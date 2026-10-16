// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement } from 'react';

import { formatPrice, formatPriceEdge } from '../../format/format.js';
import { Icon, type IconName } from '../../layout/Icon.component.js';
import controls from '../../styles/Controls.module.css';
import type { TradeChart } from '../trade-chart.validation.js';
import { useLiveCandle } from '../../live/useLiveCandle.hook.js';
import type { DisplayMapping } from './display-mapping.js';
import { buildSlots } from './display-slots.js';
import type { MarketCandle } from './market-candles.validation.js';
import { ThreeMinuteSlots } from './ThreeMinuteSlots.component.js';
import { NextCandleChart } from './NextCandleChart.component.js';
import styles from './NextCandlePanel.module.css';
import { describeHorizon, NEXT_CANDLE_TEXT } from './next-candle-state.js';
import type { AvailableProjection } from './projections.validation.js';
import type { ResultView } from './projection-text.js';
import type { ChartLayerData } from './useChartLayers.hook.js';
import { useNextCandle, type NextCandleView } from './useNextCandle.hook.js';

export type PanelDisplay = {
  readonly mapping: DisplayMapping;
  // As velas de exibição fechadas já carregadas no gráfico (nenhum pedido novo).
  readonly candles: readonly MarketCandle[];
};

export type NextCandlePanelProps = {
  readonly chart: TradeChart;
  readonly layerData: ChartLayerData;
  // Com vela de exibição na tela, o painel mostra as velas de 3 min que compõem a vela de 15 min (spec 017, RF07).
  readonly display?: PanelDisplay | undefined;
};

const RESULT_ICON: Readonly<Record<ResultView['tone'], IconName>> = {
  hit: 'check',
  miss: 'close',
  tie: 'equal',
};

function Tendency({ current }: { readonly current: AvailableProjection }): ReactElement {
  const isBuy = current.side === 'buy';
  const low = current.bandLow === null ? undefined : formatPriceEdge(current.bandLow, 'low');
  const high = current.bandHigh === null ? undefined : formatPriceEdge(current.bandHigh, 'high');
  return (
    <div className={`${styles.tendency} ${isBuy ? styles.buy : styles.sell}`}>
      <span className={styles.what}>
        <Icon name={isBuy ? 'arrowUp' : 'arrowDown'} />
        {current.label}
      </span>
      <span className={styles.why}>
        {current.message}
        {low === undefined || high === undefined ? null : (
          <>
            {' '}
            Faixa típica: <span className={styles.number}>{low}</span> a{' '}
            <span className={styles.number}>{high}</span>.
          </>
        )}
      </span>
    </div>
  );
}

function NoForecast({ view }: { readonly view: NextCandleView }): ReactElement | null {
  const { state } = view;
  if (state.kind === 'loading') return <p className={controls.muted}>{NEXT_CANDLE_TEXT.LOADING}</p>;
  if (state.kind === 'error') return <p className={controls.muted}>{NEXT_CANDLE_TEXT.ERROR}</p>;
  if (state.kind !== 'unavailable') return null;
  const isStalled = state.reason === 'price_stalled';
  return (
    <div className={`${styles.tendency} ${isStalled ? styles.warn : styles.none}`}>
      <span className={styles.what}>
        <Icon name={isStalled ? 'alert' : 'equal'} />
        {NEXT_CANDLE_TEXT.NO_FORECAST}
      </span>
      <span className={styles.why}>{state.message}</span>
    </div>
  );
}

function Result({ result }: { readonly result: ResultView | undefined }): ReactElement | null {
  if (result === undefined) return null;
  return (
    <p className={`${styles.result} ${styles[result.tone] ?? ''}`}>
      <Icon name={RESULT_ICON[result.tone]} />
      {result.text}
    </p>
  );
}

function Horizon({ view }: { readonly view: NextCandleView }): ReactElement | null {
  const { state, now, timeZone } = view;
  if (state.kind !== 'available') return null;
  const endsAt = state.current.horizonEndsAt;
  return (
    <p className={styles.horizon}>
      <Icon name="horizons" size={16} />
      {describeHorizon({ now, endsAt, timeZone })}
      {view.priceNow === undefined ? null : (
        <span className={styles.number}> · preço agora {formatPrice(view.priceNow)}</span>
      )}
    </p>
  );
}

function DisplaySlots(props: {
  readonly chart: TradeChart;
  readonly view: NextCandleView;
  readonly display: PanelDisplay;
}): ReactElement | null {
  const { chart, view, display } = props;
  const live = useLiveCandle(chart.symbol, '3m');
  if (view.window === undefined) return null;
  const slots = buildSlots({
    start: view.window.start,
    mapping: display.mapping,
    closed: display.candles,
    forming: live?.status === 'forming' ? live.candle : undefined,
    now: view.now,
  });
  return <ThreeMinuteSlots slots={slots} timeZone={view.timeZone} />;
}

// "Próxima vela de perto" (D13): o desenho pequeno da vela que se forma, a tendência do placar com a faixa, o resultado da
// previsão anterior e o aviso de que é tendência, não promessa. Estado é ícone + palavra + cor; sem tendência, sem faixa.
export function NextCandlePanel({ chart, layerData, display }: NextCandlePanelProps): ReactElement {
  const headingId = useId();
  const view = useNextCandle({ chart, layerData });
  const { state, drawing } = view;
  return (
    <aside className={styles.panel} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.title}>
        <Icon name="flag" size={16} />
        Próxima vela de perto
      </h3>
      <Horizon view={view} />
      {drawing === undefined ? null : (
        <NextCandleChart model={drawing.model} labels={drawing.labels} />
      )}
      {display === undefined ? null : <DisplaySlots chart={chart} view={view} display={display} />}
      {state.kind === 'available' ? (
        <Tendency current={state.current} />
      ) : (
        <NoForecast view={view} />
      )}
      <Result result={view.result} />
      <p className={styles.promise}>
        <Icon name="info" size={14} />
        <span>
          <strong>{NEXT_CANDLE_TEXT.PROMISE_TITLE}</strong> {NEXT_CANDLE_TEXT.PROMISE_BODY}
        </span>
      </p>
    </aside>
  );
}
