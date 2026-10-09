// Copyright (c) 2026 Ada Technology. All rights reserved.
export const DISPLAY_CURRENCY = {
  BRL: 'BRL',
  USD: 'USD',
} as const;

export type DisplayCurrency = (typeof DISPLAY_CURRENCY)[keyof typeof DISPLAY_CURRENCY];

export const DISPLAY_NAME_MAX_LENGTH = 120;
export const TIMEZONE_MAX_LENGTH = 64;
