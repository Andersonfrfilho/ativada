// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { decimalText } from '../http/decimal.validation.js';
import { NOTICE_KIND, NOTICE_STATE } from './notice.constant.js';

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
});

export type Notice = z.infer<typeof noticeSchema>;
