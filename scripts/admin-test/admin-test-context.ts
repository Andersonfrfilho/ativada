// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IdentityContext } from '../identity-test/identity-context.js';
import type { RunningApi } from '../session-test/start-api.js';

export type AdminTestContext = {
  readonly identity: IdentityContext;
  readonly api: RunningApi;
  readonly sql: Bun.SQL;
};

export type Actor = {
  readonly username: string;
  readonly email: string;
  readonly keycloakId: string;
  readonly accessToken: string;
};

export type TestActors = {
  readonly admin: Actor;
  readonly otherAdmin: Actor;
  readonly member: Actor;
  readonly adminWithoutMfaToken: string;
};

export function reportAdminStep(step: string, detail: string): void {
  console.log(`admin-test: ${step} ok - ${detail}`);
}

export function reportMeasurement(subject: string, detail: string): void {
  console.log(`admin-test: MEDIÇÃO ${subject} -> ${detail}`);
}
