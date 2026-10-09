// Copyright (c) 2026 Ada Technology. All rights reserved.
export const ME_PATH = '/v1/me';

export const PROFILE_FIELD_REASON = {
  INVALID_TIMEZONE: 'invalid_timezone',
  NO_FIELDS: 'no_fields',
} as const;

export const TIMEZONE_PATTERN = /^(?:UTC|[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+)$/;
