// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { HTTP_METHOD } from './identity-http.constant.js';
import type { IdentityAdminClient, IdentityOutcome } from './identity-admin.types.js';
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

type ParseBody<TValue> = Parameters<typeof parseOutcome<TValue>>[1];

function getAndParse<TValue>(
  http: IdentityHttp,
  path: string,
  parse: ParseBody<TValue>,
): Promise<IdentityOutcome<TValue>> {
  return http({ method: HTTP_METHOD.GET, path }).then((response) => parseOutcome(response, parse));
}

function parseUserMatch(
  email: string,
): ParseBody<{ id: string; email: string | undefined } | undefined> {
  return (body) => {
    const parsed = userListSchema.safeParse(body);
    if (!parsed.success) return undefined;
    const match = parsed.data.find((user) => user.email?.toLowerCase() === email);
    return { value: match === undefined ? undefined : { id: match.id, email: match.email } };
  };
}

const parseHasCredentials: ParseBody<boolean> = (body) => {
  const parsed = credentialListSchema.safeParse(body);
  return parsed.success ? { value: parsed.data.length > 0 } : undefined;
};

const parseRoleNames: ParseBody<readonly string[]> = (body) => {
  const parsed = roleListSchema.safeParse(body);
  return parsed.success ? { value: parsed.data.map((role) => role.name) } : undefined;
};

const parseEnabled: ParseBody<boolean> = (body) => {
  const parsed = userSchema.safeParse(body);
  return parsed.success && parsed.data.enabled !== undefined
    ? { value: parsed.data.enabled }
    : undefined;
};

const parseEmail: ParseBody<string | undefined> = (body) => {
  const parsed = userSchema.safeParse(body);
  return parsed.success ? { value: parsed.data.email } : undefined;
};

export function createIdentityReads(http: IdentityHttp): IdentityReads {
  return {
    findUserByEmail: (email) =>
      getAndParse(
        http,
        `/users?exact=true&email=${encodeURIComponent(email)}`,
        parseUserMatch(email),
      ),
    hasCredentials: (userId) =>
      getAndParse(http, `${userPath(userId)}/credentials`, parseHasCredentials),
    readEffectiveRoles: (userId) =>
      getAndParse(http, `${userPath(userId)}/role-mappings/realm/composite`, parseRoleNames),
    readEnabled: (userId) => getAndParse(http, userPath(userId), parseEnabled),
    readEmail: (userId) => getAndParse(http, userPath(userId), parseEmail),
  };
}
