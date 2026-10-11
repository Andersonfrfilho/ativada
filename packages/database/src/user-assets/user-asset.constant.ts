// Copyright (c) 2026 Ada Technology. All rights reserved.

export const USER_ASSET_SYMBOL_MAX_LENGTH = 20;
export const USER_ASSET_SYMBOL_PATTERN = '^[A-Z0-9]{2,16}USDT$';
export const USER_ASSET_PAGE_MAXIMUM_SIZE = 100;

export const USER_ASSET_MUTATE_OUTCOME = {
  SAVED: 'saved',
  REFUSED: 'refused',
  LIMIT_REACHED: 'limit_reached',
} as const;

export const USER_ASSET_DECISION_KIND = { SAVE: 'save', REFUSE: 'refuse' } as const;
