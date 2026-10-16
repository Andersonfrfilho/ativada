// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import controls from '../../styles/Controls.module.css';
import { DISPLAY_TEXT, TIMEFRAME_PHRASE } from './candle-chart.constant.js';
import type { DisplayMapping } from './display-mapping.js';

export type TimeframeNoticeProps = {
  readonly timeframe: string;
  readonly runTimeframe: string;
  // Vela de exibição menor que a da execução: a estratégia segue decidindo na da execução (spec 017).
  readonly displayMapping: DisplayMapping | undefined;
  // O período da execução começa antes do corte da retenção das velas de exibição.
  readonly hasRetentionCut: boolean;
};

function DisplayNotice({ hasRetentionCut }: { readonly hasRetentionCut: boolean }): ReactElement {
  return (
    <div role="status">
      <p className={controls.muted}>
        <strong>{DISPLAY_TEXT.LEGEND}</strong>
      </p>
      <p className={controls.muted}>{DISPLAY_TEXT.NO_ADVANTAGE}</p>
      {hasRetentionCut ? <p className={controls.muted}>{DISPLAY_TEXT.RETENTION}</p> : null}
    </div>
  );
}

// A estratégia só decide na vela da execução: nas velas maiores, previsão, placar, canal e "esperou" não existem (RF05 da 009);
// nas menores que a dividem (3 min), tudo aparece onde valeu e a frase diz que ver mais velas não é vantagem (RF10 da 017).
// Compras e vendas aparecem em qualquer vela.
export function TimeframeNotice(props: TimeframeNoticeProps): ReactElement | null {
  const { timeframe, runTimeframe, displayMapping, hasRetentionCut } = props;
  if (timeframe === runTimeframe) return null;
  if (displayMapping !== undefined) return <DisplayNotice hasRetentionCut={hasRetentionCut} />;
  return (
    <p className={controls.muted} role="status">
      Previsão, placar, canal e &quot;esperou&quot; só aparecem na vela de{' '}
      {TIMEFRAME_PHRASE[runTimeframe] ?? runTimeframe}, que é a que a estratégia usa.
    </p>
  );
}
