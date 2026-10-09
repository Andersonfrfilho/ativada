// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DISPLAY_CURRENCY, DISPLAY_NAME_MAX_LENGTH, TIMEZONE_MAX_LENGTH } from '@crypto/database';
import type { ProfilePatch } from '@crypto/database';
import { z } from '@crypto/environment';

import { PROFILE_FIELD_REASON } from './profile.constant.js';
import { resolveCanonicalTimezone } from './timezone.js';

const timezoneSchema = z
  .string()
  .max(TIMEZONE_MAX_LENGTH)
  .transform((candidate, context): string => {
    const canonical = resolveCanonicalTimezone(candidate);
    if (canonical === undefined) {
      context.addIssue({ code: 'custom', message: PROFILE_FIELD_REASON.INVALID_TIMEZONE });
      return z.NEVER;
    }
    return canonical;
  });

export const updateProfileSchema = z
  .strictObject({
    displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX_LENGTH).nullable().optional(),
    displayCurrency: z.enum([DISPLAY_CURRENCY.BRL, DISPLAY_CURRENCY.USD]).optional(),
    timezone: timezoneSchema.optional(),
    alertTelegramEnabled: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: PROFILE_FIELD_REASON.NO_FIELDS,
  });

export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;

export function toProfilePatch(body: UpdateProfileBody): ProfilePatch {
  return {
    ...(body.displayName === undefined ? {} : { displayName: body.displayName }),
    ...(body.displayCurrency === undefined ? {} : { displayCurrency: body.displayCurrency }),
    ...(body.timezone === undefined ? {} : { timezone: body.timezone }),
    ...(body.alertTelegramEnabled === undefined
      ? {}
      : { alertTelegramEnabled: body.alertTelegramEnabled }),
  };
}
