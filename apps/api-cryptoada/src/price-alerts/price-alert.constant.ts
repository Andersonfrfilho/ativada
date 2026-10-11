// Copyright (c) 2026 Ada Technology. All rights reserved.

export const PRICE_ALERTS_PATH = '/v1/price-alerts';
export const PRICE_ALERT_PATH = '/v1/price-alerts/:alertId';
export const PRICE_ALERT_ID_PARAM = 'alertId';

export const PRICE_ALERT_REASON = {
  NOT_ENABLED: 'not_enabled',
  INVALID_VALUE: 'invalid_value',
} as const;
export const NO_FIELD_REASON = 'at_least_one_field_required';
