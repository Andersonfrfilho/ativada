// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { decimalText } from '../http/decimal.validation.js';

export const liveSummaryItemSchema = z.object({
  runId: z.string(),
  strategyName: z.string(),
  // Texto aberto: um modo que este painel não conhece vira "com analista" sem o modo.
  analystMode: z.string().nullable(),
  initialBalance: decimalText,
  balance: decimalText,
  result: decimalText,
  resultRate: decimalText,
  buyAndHold: z
    .object({
      resultRate: decimalText,
      differencePoints: decimalText,
      comparison: z.enum(['above', 'even', 'below']),
    })
    .nullable(),
  buyCount: z.number(),
  sellCount: z.number(),
  lastDecisionAt: z.number().nullable(),
  isWaitingForData: z.boolean(),
});

export const liveSummarySchema = z.object({ items: z.array(liveSummaryItemSchema) });

export type LiveSummaryItem = z.infer<typeof liveSummaryItemSchema>;
