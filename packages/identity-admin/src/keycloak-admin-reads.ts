// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import { HTTP_METHOD } from './identity-http.constant.js';
import type { IdentityAdminClient } from './identity-admin.types.js';
import type { IdentityHttp } from './identity-http.js';
import { parseOutcome } from './identity-outcome.js';

const userSchema = z.looseObject({
  id: z.string().min(1),
  email: z.string().optional(),
  enabled: z.boolean().optional(),
});
const userListSchema = z.array(userSchema);
const credentialListSchema = z.array(z.looseObject({ id: z.string() }));
const roleListSchema = z.array(z.looseObject({ name: z.string() }));

export type IdentityReads = Pick<
  IdentityAdminClient,
  'findUserByEmail' | 'hasCredentials' | 'readEffectiveRoles' | 'readEmail' | 'readEnabled'
>;

export function userPath(userId: string): string {
  return `/users/${encodeURIComponent(userId)}`;
}

export function createIdentityReads(http: IdentityHttp): IdentityReads {
  return {
    findUserByEmail: async (email) =>
      parseOutcome(
        await http({
          method: HTTP_METHOD.GET,
          path: `/users?exact=true&email=${encodeURIComponent(email)}`,
        }),
        (body) => {
          const parsed = userListSchema.safeParse(body);
          if (!parsed.success) return undefined;
          const match = parsed.data.find((user) => user.email?.toLowerCase() === email);
          return { value: match === undefined ? undefined : { id: match.id, email: match.email } };
        },
      ),
    hasCredentials: async (userId) =>
      parseOutcome(
        await http({ method: HTTP_METHOD.GET, path: `${userPath(userId)}/credentials` }),
        (body) => {
          const parsed = credentialListSchema.safeParse(body);
          return parsed.success ? { value: parsed.data.length > 0 } : undefined;
        },
      ),
    readEffectiveRoles: async (userId) =>
      parseOutcome(
        await http({
          method: HTTP_METHOD.GET,
          path: `${userPath(userId)}/role-mappings/realm/composite`,
        }),
        (body) => {
          const parsed = roleListSchema.safeParse(body);
          return parsed.success ? { value: parsed.data.map((role) => role.name) } : undefined;
        },
      ),
    readEnabled: async (userId) =>
      parseOutcome(await http({ method: HTTP_METHOD.GET, path: userPath(userId) }), (body) => {
        const parsed = userSchema.safeParse(body);
        return parsed.success && parsed.data.enabled !== undefined
          ? { value: parsed.data.enabled }
          : undefined;
      }),
    readEmail: async (userId) =>
      parseOutcome(await http({ method: HTTP_METHOD.GET, path: userPath(userId) }), (body) => {
        const parsed = userSchema.safeParse(body);
        return parsed.success ? { value: parsed.data.email } : undefined;
      }),
  };
}
