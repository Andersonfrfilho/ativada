// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { decimalText } from '../http/decimal.validation.js';
import { NOTICE_KIND, NOTICE_STATE } from './notice.constant.js';

const manualSchema = z.object({
  orderType: z.string().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  referencePrice: decimalText,
  quantity: decimalText.nullable(),
  runBalance: decimalText.nullable(),
  notional: decimalText.nullable(),
  targetPrice: decimalText,
  stopPrice: decimalText,
  tickSize: decimalText.nullable(),
  quantityStep: decimalText.nullable(),
  costRate: decimalText.nullable(),
  netGainRate: decimalText.nullable(),
  netLossRate: decimalText.nullable(),
  netRatio: decimalText.nullable(),
  breakEvenEntry: decimalText.nullable(),
  history: z.object({ days: z.number(), netReturnRate: decimalText }).nullable(),
  how: z.string().nullable(),
  quantityText: z.string().nullable(),
  costText: z.string().nullable(),
  netText: z.string().nullable(),
  giveUpText: z.string().nullable(),
  historyText: z.string(),
  honesty: z.string(),
});

export type NoticeManual = z.infer<typeof manualSchema>;

// Espelho de `GET /v1/notices` (apps/api-ativada/src/notices/notices.docs.ts): mudou o contrato, mude aqui.
export const noticeSchema = z.object({
  noticeId: z.string().min(1),
  runId: z.string().nullable(),
  symbol: z.string(),
  timeframe: z.string().nullable(),
  kind: z.enum(NOTICE_KIND),
  state: z.enum(NOTICE_STATE),
  occurredAt: z.iso.datetime(),
  candleTime: z.number().nullable(),
  confirmsAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  operationKey: z.string().nullable(),
  price: decimalText.nullable(),
  limitPrice: decimalText.nullable(),
  fee: decimalText.nullable(),
  resultRate: decimalText.nullable(),
  targetPrice: decimalText.nullable(),
  entryPrice: decimalText.nullable(),
  stopPrice: decimalText.nullable(),
  reasonCode: z.string(),
  title: z.string(),
  message: z.string(),
  detail: z.string().nullable(),
  manual: manualSchema.nullable(),
});

export type Notice = z.infer<typeof noticeSchema>;
