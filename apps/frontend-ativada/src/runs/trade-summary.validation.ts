// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { decimalText } from '../http/decimal.validation.js';

export const tradeSummarySchema = z.object({
  closedTrades: z.number(),
  totalPaid: decimalText,
  totalReceived: decimalText,
  totalFees: decimalText,
  net: decimalText,
  openTrades: z.number(),
  openPaid: decimalText.nullable(),
  message: z.string(),
});

export type TradeSummary = z.infer<typeof tradeSummarySchema>;
