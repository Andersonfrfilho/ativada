// Copyright (c) 2026 Ada Technology. All rights reserved.
export const USER_RESOLUTION_STATUS = {
  ACTIVE: 'active',
  DELETED: 'deleted',
  BLOCKED: 'blocked',
} as const;

export type UserResolutionStatus =
  (typeof USER_RESOLUTION_STATUS)[keyof typeof USER_RESOLUTION_STATUS];
