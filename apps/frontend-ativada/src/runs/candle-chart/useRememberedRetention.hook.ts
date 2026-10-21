// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState } from 'react';

import { DISPLAY_TIMEFRAMES } from './candle-chart.constant.js';

export type RememberedRetention = Readonly<Record<string, number>>;

// O corte da retenção só chega com as velas de exibição e é de cada uma (1 min e 3 min têm prazos diferentes); guardado, vale
// também depois que a pessoa volta para a vela da execução.
export function useRememberedRetention(
  current: number | undefined,
  timeframe: string,
): RememberedRetention {
  const [remembered, setRemembered] = useState<RememberedRetention>({});
  const isDisplay = DISPLAY_TIMEFRAMES.some((display) => display === timeframe);
  if (!isDisplay || current === undefined) return remembered;
  if (current !== remembered[timeframe]) {
    setRemembered({ ...remembered, [timeframe]: current });
  }
  return { ...remembered, [timeframe]: current };
}
