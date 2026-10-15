// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import controls from '../../styles/Controls.module.css';
import { TIMEFRAME_PHRASE } from './candle-chart.constant.js';

export type TimeframeNoticeProps = {
  readonly timeframe: string;
  readonly runTimeframe: string;
};

// A estratégia só decide na vela da execução: nas outras, previsão, placar, linhas e "esperou" não existem (RF05).
// Compras e vendas aparecem em qualquer vela.
export function TimeframeNotice({
  timeframe,
  runTimeframe,
}: TimeframeNoticeProps): ReactElement | null {
  if (timeframe === runTimeframe) return null;
  return (
    <p className={controls.muted} role="status">
      Previsão, placar, canal e &quot;esperou&quot; só aparecem na vela de{' '}
      {TIMEFRAME_PHRASE[runTimeframe] ?? runTimeframe}, que é a que a estratégia usa.
    </p>
  );
}
