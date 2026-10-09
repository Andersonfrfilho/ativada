// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope, ProfilePatch, ProfileRepository } from '@crypto/database';

import { ProfileNotFoundError } from './profile.error.js';
import { toProfileView, type ProfileView } from './profile-view.js';

export type GetProfileUseCase = (scope: OwnerScope) => Promise<ProfileView>;

export type UpdateProfileUseCase = (scope: OwnerScope, patch: ProfilePatch) => Promise<ProfileView>;

export function createGetProfileUseCase(repository: ProfileRepository): GetProfileUseCase {
  return async (scope) => {
    const record = await repository.findProfile(scope);
    if (record === undefined) throw new ProfileNotFoundError();
    return toProfileView(record);
  };
}

export function createUpdateProfileUseCase(repository: ProfileRepository): UpdateProfileUseCase {
  return async (scope, patch) => {
    const record = await repository.updateProfile(scope, patch);
    if (record === undefined) throw new ProfileNotFoundError();
    return toProfileView(record);
  };
}
