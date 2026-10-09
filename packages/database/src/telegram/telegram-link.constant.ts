// Copyright (c) 2026 Ada Technology. All rights reserved.
export const MAX_ATTEMPTS_PER_LINK_CODE = 5;

export const LINK_OUTCOME = {
  LINKED: 'linked',
  REJECTED: 'rejected',
} as const;

export type LinkOutcome = (typeof LINK_OUTCOME)[keyof typeof LINK_OUTCOME];
