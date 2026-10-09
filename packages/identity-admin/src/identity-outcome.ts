// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_STATUS } from './identity-http.constant.js';
import { IDENTITY_OUTCOME, KEYCLOAK_USER_NOT_FOUND_ERROR } from './identity-admin.constant.js';
import type { IdentityOutcome } from './identity-admin.types.js';
import type { IdentityResponse } from './identity-http.js';

export const UNAVAILABLE = { status: IDENTITY_OUTCOME.UNAVAILABLE } as const;
export const NOT_FOUND = { status: IDENTITY_OUTCOME.NOT_FOUND } as const;
export const CONFLICT = { status: IDENTITY_OUTCOME.CONFLICT } as const;

export type Parsed<TValue> = { readonly value: TValue };

function isUserNotFoundBody(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    body.error === KEYCLOAK_USER_NOT_FOUND_ERROR
  );
}

// 404 só vale como "usuário não existe" com o corpo do Keycloak; sem ele é realm ou URL errados.
export function notFoundOutcome(response: IdentityResponse): IdentityOutcome<never> {
  return isUserNotFoundBody(response.body) ? NOT_FOUND : UNAVAILABLE;
}

export function ok<TValue>(value: TValue): IdentityOutcome<TValue> {
  return { status: IDENTITY_OUTCOME.OK, value };
}

export function parseOutcome<TValue>(
  response: IdentityResponse | undefined,
  parse: (body: unknown) => Parsed<TValue> | undefined,
): IdentityOutcome<TValue> {
  if (response === undefined) return UNAVAILABLE;
  if (response.status === HTTP_STATUS.NOT_FOUND) return notFoundOutcome(response);
  if (response.status !== HTTP_STATUS.OK) return UNAVAILABLE;
  const parsed = parse(response.body);
  return parsed === undefined ? UNAVAILABLE : ok(parsed.value);
}

export function emptyOutcome(
  response: IdentityResponse | undefined,
  expectedStatus: number,
): IdentityOutcome<undefined> {
  if (response === undefined) return UNAVAILABLE;
  if (response.status === HTTP_STATUS.NOT_FOUND) return notFoundOutcome(response);
  return response.status === expectedStatus ? ok(undefined) : UNAVAILABLE;
}
