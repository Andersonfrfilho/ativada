// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import {
  decimalTextSchema,
  epochMillisecondsSchema,
  resourceIdSchema,
} from '../../openapi/schema-primitives.js';
import { BUY_AND_HOLD_COMPARISON } from '../live-status/live-status.constant.js';
import { ANALYST_REQUEST_MODE } from '../run-analyst-request.js';

const LIVE_SUMMARY_ITEM_SCHEMA = z.strictObject({
  runId: resourceIdSchema,
  strategyName: z.string(),
  analystMode: z.enum(ANALYST_REQUEST_MODE).nullable(),
  initialBalance: decimalTextSchema,
  balance: decimalTextSchema,
  result: decimalTextSchema,
  resultRate: decimalTextSchema,
  buyAndHold: z
    .strictObject({
      resultRate: decimalTextSchema,
      differencePoints: decimalTextSchema,
      comparison: z.enum(BUY_AND_HOLD_COMPARISON),
    })
    .nullable(),
  buyCount: z.number().int().nonnegative(),
  sellCount: z.number().int().nonnegative(),
  lastDecisionAt: epochMillisecondsSchema.nullable(),
  isWaitingForData: z.boolean(),
});

export const LIVE_SUMMARY_SCHEMA = z.strictObject({ items: z.array(LIVE_SUMMARY_ITEM_SCHEMA) });
