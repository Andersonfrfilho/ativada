// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './Office.module.css';
import type { MonitorModel, MonitorReadout } from './office-monitors.js';

const GAUGE_WIDTH = 140;
const LOW_ZONE = 0.3;
const HIGH_ZONE = 0.7;
const GAUGE_LEFT = 10;

function readoutRows(readouts: readonly MonitorReadout[], top: number): ReactElement[] {
  return readouts.slice(0, 4).map((readout, index) => (
    <text key={readout.key} className={styles.screenText} x="8" y={top + index * 12}>
      {readout.label} {readout.text}
    </text>
  ));
}

function Track({ className, x, width }: TrackProps): ReactElement {
  return <rect className={className} x={x} y="24" width={width} height="6" rx="3" />;
}

type TrackProps = {
  readonly className: string | undefined;
  readonly x: number;
  readonly width: number;
};

// A barra de 0 a 100 do RSI: faixas de "barato" e "caro" (30 e 70) e a marca da leitura gravada.
function Oscillator({ model }: { readonly model: MonitorModel }): ReactElement {
  const gauge = model.readouts.find((readout) => readout.ratio !== undefined);
  const mark = GAUGE_LEFT + (gauge?.ratio ?? 0) * GAUGE_WIDTH;
  const others = model.readouts.filter((readout) => readout.ratio === undefined);
  return (
    <>
      <Track className={styles.gaugeTrack} x={GAUGE_LEFT} width={GAUGE_WIDTH} />
      <Track className={styles.gaugeLow} x={GAUGE_LEFT} width={GAUGE_WIDTH * LOW_ZONE} />
      <Track
        className={styles.gaugeHigh}
        x={GAUGE_LEFT + GAUGE_WIDTH * HIGH_ZONE}
        width={GAUGE_WIDTH * (1 - HIGH_ZONE)}
      />
      {gauge === undefined ? null : (
        <>
          <rect className={styles.gaugeMark} x={mark - 1.5} y="20" width="3" height="14" rx="1.5" />
          <text className={styles.screenText} x="8" y="46">
            {gauge.label} {gauge.text}
          </text>
        </>
      )}
      {readoutRows(others, 58)}
    </>
  );
}

// O Medo e Ganância: semicírculo com a agulha na leitura gravada (0 a 100; até 25 medo, a partir de 75 ganância).
function Gauge({ model }: { readonly model: MonitorModel }): ReactElement {
  const reading = model.readouts[0];
  const angle = -90 + (reading?.ratio ?? 0.5) * 180;
  return (
    <>
      <path className={styles.gaugeArc} d="M40 60a40 40 0 0 1 80 0" />
      <line
        className={styles.gaugeNeedle}
        x1="80"
        y1="60"
        x2="80"
        y2="30"
        transform={`rotate(${angle} 80 60)`}
      />
      <text className={styles.screenValue} x="80" y="78" textAnchor="middle">
        {reading?.text ?? ''}
      </text>
    </>
  );
}

function Averages({ model }: { readonly model: MonitorModel }): ReactElement {
  return <>{readoutRows(model.readouts, 30)}</>;
}

function Body({ model }: { readonly model: MonitorModel }): ReactElement {
  switch (model.kind) {
    case 'oscillator':
      return <Oscillator model={model} />;
    case 'gauge':
      return <Gauge model={model} />;
    case 'averages':
    case 'volume':
      return <Averages model={model} />;
    case 'empty':
      return (
        <text className={styles.screenText} x="8" y="36">
          sem leitura gravada
        </text>
      );
  }
}

// O monitor de uma mesa: tela sempre escura, desenhada só com as leituras que o servidor gravou na vela.
export function OfficeMonitor({ model }: { readonly model: MonitorModel }): ReactElement {
  return (
    <svg
      className={styles.monitor}
      viewBox="0 0 160 84"
      aria-hidden="true"
      focusable="false"
      data-animated=""
    >
      <rect className={styles.bezel} x="1" y="1" width="158" height="82" rx="6" />
      <text className={styles.screenTitle} x="8" y="14">
        {model.title}
      </text>
      <Body model={model} />
    </svg>
  );
}
