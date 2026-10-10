// Copyright (c) 2026 Ada Technology. All rights reserved.
export const RUN_LOG_KIND = { SIGNAL: 'signal', ORDER: 'order', FILL: 'fill' } as const;
export type RunLogKind = (typeof RUN_LOG_KIND)[keyof typeof RUN_LOG_KIND];

// Dentro do mesmo candle a história anda assim: o preenchimento da ordem anterior acontece na abertura, o sinal é decidido no
// fechamento e a ordem nova nasce com ele.
export const RUN_LOG_RANK: Readonly<Record<RunLogKind, number>> = {
  [RUN_LOG_KIND.FILL]: 1,
  [RUN_LOG_KIND.SIGNAL]: 2,
  [RUN_LOG_KIND.ORDER]: 3,
};
