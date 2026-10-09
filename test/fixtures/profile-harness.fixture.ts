// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createGetProfileUseCase,
  createUpdateProfileUseCase,
} from '../../apps/api-crypto/src/profile/profile.use-case.js';
import { createProfileRoutes } from '../../apps/api-crypto/src/profile/profile.routes.js';
import { createApiHarness, type ApiHarness } from './api-harness.fixture.js';
import { createInMemoryUserStore, type InMemoryUserStore } from './in-memory-user-store.fixture.js';
import { signTestToken } from './token-signing.fixture.js';

export const SUBJECT_A = 'subject-user-a';
export const SUBJECT_B = 'subject-user-b';
export const USER_A_ID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d01';
export const USER_B_ID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d02';

export type ProfileHarness = {
  readonly api: ApiHarness;
  readonly store: InMemoryUserStore;
  readonly tokenFor: (subject: string) => Promise<string>;
  readonly stop: () => Promise<void>;
};

export async function createProfileHarness(): Promise<ProfileHarness> {
  const store = createInMemoryUserStore();
  store.seedUser({ id: USER_A_ID, subject: SUBJECT_A });
  store.seedUser({ id: USER_B_ID, subject: SUBJECT_B });
  const api = await createApiHarness({
    userIdsBySubject: { [SUBJECT_A]: USER_A_ID, [SUBJECT_B]: USER_B_ID },
    routeFactory: () =>
      createProfileRoutes({
        getProfile: createGetProfileUseCase(store.profiles),
        updateProfile: createUpdateProfileUseCase(store.profiles),
      }),
  });
  return {
    api,
    store,
    tokenFor: (subject) => signTestToken({ key: api.key, claims: { sub: subject } }),
    stop: () => api.stop(),
  };
}
