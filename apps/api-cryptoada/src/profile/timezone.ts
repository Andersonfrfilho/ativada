// Copyright (c) 2026 Ada Technology. All rights reserved.
import { TIMEZONE_PATTERN } from './profile.constant.js';

export function resolveCanonicalTimezone(candidate: string): string | undefined {
  if (!TIMEZONE_PATTERN.test(candidate)) return undefined;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: candidate }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}
