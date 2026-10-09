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

export type ListedResource = {
  readonly id: string;
};

export type CrossOwnerContract = {
  readonly ownerScope: OwnerScope;
  readonly otherUserScope: OwnerScope;
  readonly createResource: (scope: OwnerScope) => Promise<string>;
  // Regra do contrato: projeta TODOS os campos mutáveis; undefined ou null significam "não encontrado".
  readonly readResource: (scope: OwnerScope, resourceId: string) => Promise<unknown>;
  readonly listResources: (scope: OwnerScope) => Promise<readonly ListedResource[]>;
  readonly attempts: Readonly<Record<string, OwnedResourceAttempt>>;
};

type AttemptCheckParams = {
  readonly contract: CrossOwnerContract;
  readonly attemptName: string;
  readonly attempt: OwnedResourceAttempt;
};

type ResourceSnapshot = {
  readonly scope: OwnerScope;
  readonly resourceId: string;
  readonly view: unknown;
};

type SnapshotCheckParams = {
  readonly contract: CrossOwnerContract;
  readonly attemptName: string;
  readonly snapshot: ResourceSnapshot;
};

function isAbsent(view: unknown): boolean {
  return view === undefined || view === null;
}

export async function expectOtherUserGetsNotFound(contract: CrossOwnerContract): Promise<void> {
  expect(contract.otherUserScope.ownerUserId).not.toBe(contract.ownerScope.ownerUserId);
  const attemptEntries = Object.entries(contract.attempts);
  expect(attemptEntries.length).toBeGreaterThan(0);
  for (const [attemptName, attempt] of attemptEntries) {
    await expectAttemptIsIsolated({ contract, attemptName, attempt });
  }
}

async function takeSnapshot(
  contract: CrossOwnerContract,
  scope: OwnerScope,
): Promise<ResourceSnapshot> {
  const resourceId = await contract.createResource(scope);
  const view: unknown = structuredClone(await contract.readResource(scope, resourceId));
  return { scope, resourceId, view };
}

async function expectSnapshotIntact(params: SnapshotCheckParams): Promise<void> {
  const { contract, attemptName, snapshot } = params;
  const currentView = await contract.readResource(snapshot.scope, snapshot.resourceId);
  expect({ attemptName, currentView }).toStrictEqual({ attemptName, currentView: snapshot.view });
}

async function expectListingIsolated(
  params: SnapshotCheckParams & { readonly otherUserScope: OwnerScope },
): Promise<void> {
  const { contract, attemptName, snapshot, otherUserScope } = params;
  const ownerIds = (await contract.listResources(snapshot.scope)).map((listed) => listed.id);
  const otherUserIds = (await contract.listResources(otherUserScope)).map((listed) => listed.id);
  expect({
    attemptName,
    ownerListsResource: ownerIds.includes(snapshot.resourceId),
    otherUserListsResource: otherUserIds.includes(snapshot.resourceId),
  }).toStrictEqual({ attemptName, ownerListsResource: true, otherUserListsResource: false });
}

async function expectAttemptIsIsolated(params: AttemptCheckParams): Promise<void> {
  const { contract, attemptName, attempt } = params;
  const ownerSnapshot = await takeSnapshot(contract, contract.ownerScope);
  const otherUserSnapshot = await takeSnapshot(contract, contract.otherUserScope);
  expect({
    attemptName,
    ownerSeesResource: !isAbsent(ownerSnapshot.view),
    otherUserSeesOwnResource: !isAbsent(otherUserSnapshot.view),
  }).toStrictEqual({ attemptName, ownerSeesResource: true, otherUserSeesOwnResource: true });

  const otherUserView = await contract.readResource(
    contract.otherUserScope,
    ownerSnapshot.resourceId,
  );
  expect({ attemptName, otherUserSeesIt: !isAbsent(otherUserView) }).toStrictEqual({
    attemptName,
    otherUserSeesIt: false,
  });
  await expectListingIsolated({
    contract,
    attemptName,
    snapshot: ownerSnapshot,
    otherUserScope: contract.otherUserScope,
  });

  const otherUserOutcome = await attempt(contract.otherUserScope, ownerSnapshot.resourceId);
  expect({ attemptName, otherUserOutcome }).toStrictEqual({
    attemptName,
    otherUserOutcome: ACCESS_OUTCOME.NOT_FOUND,
  });
  await expectSnapshotIntact({ contract, attemptName, snapshot: ownerSnapshot });
  await expectSnapshotIntact({ contract, attemptName, snapshot: otherUserSnapshot });

  const ownerOutcome = await attempt(contract.ownerScope, ownerSnapshot.resourceId);
  expect({ attemptName, ownerOutcome }).toStrictEqual({
    attemptName,
    ownerOutcome: ACCESS_OUTCOME.GRANTED,
  });
  await expectSnapshotIntact({ contract, attemptName, snapshot: otherUserSnapshot });
}
