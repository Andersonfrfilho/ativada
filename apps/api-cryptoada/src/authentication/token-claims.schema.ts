// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import { normalizeAuthenticationLevel } from './authentication-level.js';
import {
  BEARER_TOKEN_TYPE,
  SUBJECT_MAX_LENGTH,
  type AuthenticationLevel,
} from './authentication.constant.js';
import { USER_ROLE, type UserRole } from './user-role.constant.js';

export type VerifiedAccessToken = {
  readonly subject: string;
  readonly roles: readonly UserRole[];
  readonly isEmailVerified: boolean;
  readonly authenticationLevel: AuthenticationLevel;
  readonly authenticationTime: number | undefined;
};

const KNOWN_ROLES: readonly string[] = Object.values(USER_ROLE);

function isUserRole(value: string): value is UserRole {
  return KNOWN_ROLES.includes(value);
}

export function createTokenClaimsSchema(
  authorizedParties: readonly string[],
): z.ZodType<VerifiedAccessToken> {
  return z
    .object({
      sub: z.string().min(1).max(SUBJECT_MAX_LENGTH),
      typ: z.literal(BEARER_TOKEN_TYPE),
      azp: z.string().refine((value) => authorizedParties.includes(value)),
      email_verified: z.boolean().default(false),
      realm_access: z.object({ roles: z.array(z.string()) }).optional(),
      acr: z.string().optional(),
      auth_time: z.number().int().optional(),
    })
    .transform((claims): VerifiedAccessToken => ({
      subject: claims.sub,
      roles: (claims.realm_access?.roles ?? []).filter(isUserRole),
      isEmailVerified: claims.email_verified,
      authenticationLevel: normalizeAuthenticationLevel(claims.acr),
      authenticationTime: claims.auth_time,
    }));
}
