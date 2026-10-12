// Copyright (c) 2026 Ada Technology. All rights reserved.

export const HORIZON_DAYS = [7, 15, 30] as const;

// Limiares do spec 003 §5; mudar qualquer um muda o que o painel chama de "Recomendável".
export const HORIZON_RECOMMENDATION_RULES = {
  minimumWindows: 60,
  minimumPositivePercent: 55,
  minimumWorstDecile: '-0.1',
  maximumFeeShare: '0.5',
} as const;

export const HORIZON_RATE_DECIMAL_PLACES = 8;

export const INTRADAY_VERDICT = { NOT_WORTH: 'NAO_COMPENSA', WORTH: 'COMPENSA' } as const;
export type IntradayVerdict = (typeof INTRADAY_VERDICT)[keyof typeof INTRADAY_VERDICT];
