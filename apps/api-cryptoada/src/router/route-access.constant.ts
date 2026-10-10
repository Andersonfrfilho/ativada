// Copyright (c) 2026 Ada Technology. All rights reserved.
export const ROUTE_ACCESS = {
  PUBLIC: 'public',
  USER: 'user',
  ADMIN: 'admin',
} as const;

export type ProtectedRouteAccess = typeof ROUTE_ACCESS.USER | typeof ROUTE_ACCESS.ADMIN;

export const ADMIN_PATH_PREFIX = '/v1/admin/';
