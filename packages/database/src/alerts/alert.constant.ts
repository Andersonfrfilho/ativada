// Copyright (c) 2026 Ada Technology. All rights reserved.
import { SIGNAL_ACTION } from '../run-results/run-result.constant.js';

export const ALERT_CHANNEL = { TELEGRAM: 'telegram' } as const;
export type AlertChannel = (typeof ALERT_CHANNEL)[keyof typeof ALERT_CHANNEL];

// Só BUY e SELL geram alerta; HOLD nunca.
export const ALERT_SIDE = { BUY: SIGNAL_ACTION.BUY, SELL: SIGNAL_ACTION.SELL } as const;
export type AlertSide = (typeof ALERT_SIDE)[keyof typeof ALERT_SIDE];

export const ALERT_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
  SKIPPED: 'skipped',
} as const;
export type AlertStatus = (typeof ALERT_STATUS)[keyof typeof ALERT_STATUS];

export const ALERT_ERROR_CODE_MAX_LENGTH = 32;
export const ALERT_CLAIM_MAXIMUM_BATCH = 100;
