// Copyright (c) 2026 Ada Technology. All rights reserved.
import { expect } from 'bun:test';

import type { OwnerScope } from '../../packages/database/src/ownership/owner-scope.js';

export const ACCESS_OUTCOME = {
  GRANTED: 'granted',
  NOT_FOUND: 'not_found',
} as const;

export type AccessOutcome = (typeof ACCESS_OUTCOME)[keyof typeof ACCESS_OUTCOME];

export type OwnedResourceAttempt = (
  scope: OwnerScope,
  resourceId: string,
) => Promise<AccessOutcome>;

export type CrossOwnerContract = {
  readonly ownerScope: OwnerScope;
  readonly otherUserScope: OwnerScope;
  readonly createResource: (scope: OwnerScope) => Promise<string>;
  readonly readResource: (scope: OwnerScope, resourceId: string) => Promise<unknown>;
  readonly attempts: Readonly<Record<string, OwnedResourceAttempt>>;
};

type AttemptCheckParams = {
  readonly contract: CrossOwnerContract;
  readonly attemptName: string;
  readonly attempt: OwnedResourceAttempt;
};

export async function expectOtherUserGetsNotFound(contract: CrossOwnerContract): Promise<void> {
  expect(contract.otherUserScope.ownerUserId).not.toBe(contract.ownerScope.ownerUserId);
  const attemptEntries = Object.entries(contract.attempts);
  expect(attemptEntries.length).toBeGreaterThan(0);
  for (const [attemptName, attempt] of attemptEntries) {
    await expectAttemptIsIsolated({ contract, attemptName, attempt });
  }
}

async function expectAttemptIsIsolated(params: AttemptCheckParams): Promise<void> {
  const { contract, attemptName, attempt } = params;
  const resourceId = await contract.createResource(contract.ownerScope);
  const ownerViewBefore: unknown = structuredClone(
    await contract.readResource(contract.ownerScope, resourceId),
  );
  expect({ attemptName, ownerSeesResource: ownerViewBefore !== undefined }).toStrictEqual({
    attemptName,
    ownerSeesResource: true,
  });

  const otherUserView = await contract.readResource(contract.otherUserScope, resourceId);
  expect({ attemptName, otherUserView }).toStrictEqual({ attemptName, otherUserView: undefined });

  const otherUserOutcome = await attempt(contract.otherUserScope, resourceId);
  expect({ attemptName, otherUserOutcome }).toStrictEqual({
    attemptName,
    otherUserOutcome: ACCESS_OUTCOME.NOT_FOUND,
  });

  const ownerViewAfter = await contract.readResource(contract.ownerScope, resourceId);
  expect({ attemptName, ownerViewAfter }).toStrictEqual({
    attemptName,
    ownerViewAfter: ownerViewBefore,
  });

  const ownerOutcome = await attempt(contract.ownerScope, resourceId);
  expect({ attemptName, ownerOutcome }).toStrictEqual({
    attemptName,
    ownerOutcome: ACCESS_OUTCOME.GRANTED,
  });
}
