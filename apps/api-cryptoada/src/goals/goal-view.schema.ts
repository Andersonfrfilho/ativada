// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import {
  isoDateTimeSchema,
  decimalTextSchema,
  resourceIdSchema,
} from '../openapi/schema-primitives.js';

export const GOAL_VIEW_SCHEMA = z.strictObject({
  id: resourceIdSchema,
  symbol: z.string(),
  targetRate: decimalTextSchema,
  horizonDays: z.number().int().positive(),
  maxLossRate: decimalTextSchema,
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
