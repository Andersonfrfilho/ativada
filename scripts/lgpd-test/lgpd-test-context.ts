// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Actor, AdminTestContext } from '../admin-test/admin-test-context.js';

export type LgpdContext = AdminTestContext & {
  readonly databaseUrl: string;
};

export type LgpdOwners = {
  readonly admin: Actor;
  readonly ownerA: Actor;
  readonly ownerB: Actor;
};

export type AuditSnapshot = {
  readonly total: number;
  readonly referencingB: number;
  readonly adminRowsOfA: number;
};

export function reportLgpdStep(step: string, detail: string): void {
  console.log(`lgpd-test: ${step} ok - ${detail}`);
}

export function reportLgpdMeasurement(subject: string, detail: string): void {
  console.log(`lgpd-test: MEDIÇÃO ${subject} -> ${detail}`);
}
