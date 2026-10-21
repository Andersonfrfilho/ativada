// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement, RefObject } from 'react';

import styles from './CandleChart.module.css';
import type { TooltipModel } from './tooltip-model.js';

export type ChartTooltipProps = {
  readonly id: string;
  readonly model: TooltipModel | undefined;
  readonly tipRef: RefObject<HTMLDivElement | null>;
};

// O balão junto do cursor (ou no canto, pelo teclado) com os valores daquela vela. Só texto: a posição vem de variáveis CSS
// definidas pelo gráfico a cada quadro; o balão não recebe o mouse e não anuncia nada sozinho (o anúncio é o do teclado).
export function ChartTooltip({ id, model, tipRef }: ChartTooltipProps): ReactElement {
  return (
    <div
      ref={tipRef}
      id={id}
      role="tooltip"
      className={styles.tooltip}
      hidden={model === undefined}
    >
      {model === undefined ? null : <TooltipBody model={model} />}
    </div>
  );
}

function TooltipBody({ model }: { readonly model: TooltipModel }): ReactElement {
  const { ohlc } = model;
  return (
    <>
      <p className={styles.tipTitle}>{model.title}</p>
      {model.context === undefined ? null : <p className={styles.tipNote}>{model.context}</p>}
      <dl className={styles.tipOhlc}>
        <TipRow label="Abertura" value={ohlc.open} />
        <TipRow label="Máxima" value={ohlc.high} />
        <TipRow label="Mínima" value={ohlc.low} />
        <TipRow label="Fechamento" value={ohlc.close} />
        {ohlc.change === undefined ? null : <TipRow label="Variação" value={ohlc.change} />}
        <TipRow label="Volume" value={ohlc.volume} />
      </dl>
      <dl className={styles.tipValues}>
        {model.rows.map((row) => (
          <TipRow key={row.label} label={row.label} value={row.value} />
        ))}
      </dl>
      {model.notes.map((note) => (
        <p key={note} className={styles.tipNote}>
          {note}
        </p>
      ))}
    </>
  );
}

function TipRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
