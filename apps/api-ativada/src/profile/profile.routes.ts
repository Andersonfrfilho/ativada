// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { Route } from '../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { readValidatedBody } from '../shared/http/read-validated-body.js';
import { ME_PATH } from './profile.constant.js';
import { PROFILE_DOCUMENTATION } from './profile.docs.js';
import type { GetProfileUseCase, UpdateProfileUseCase } from './profile.use-case.js';
import { toProfilePatch, updateProfileSchema } from './update-profile-request.js';

export type ProfileRouteDependencies = {
  readonly getProfile: GetProfileUseCase;
  readonly updateProfile: UpdateProfileUseCase;
};

export function createProfileRoutes(dependencies: ProfileRouteDependencies): readonly Route[] {
  return [
    {
      method: HTTP_METHOD.GET,
      path: ME_PATH,
      access: ROUTE_ACCESS.USER,
      documentation: PROFILE_DOCUMENTATION.get,
      handler: async ({ scope }): Promise<RouteResult> => ({
        status: HTTP_STATUS.OK,
        data: await dependencies.getProfile(scope),
      }),
    },
    {
      method: HTTP_METHOD.PATCH,
      path: ME_PATH,
      access: ROUTE_ACCESS.USER,
      documentation: PROFILE_DOCUMENTATION.update,
      handler: async ({ scope, request }): Promise<RouteResult> => {
        const body = await readValidatedBody(request, updateProfileSchema);
        return {
          status: HTTP_STATUS.OK,
          data: await dependencies.updateProfile(scope, toProfilePatch(body)),
        };
      },
    },
  ];
}
