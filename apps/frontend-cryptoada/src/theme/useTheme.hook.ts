// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useSyncExternalStore } from 'react';

import { getTheme, subscribeToTheme, type Theme } from './theme-store.js';

export function useTheme(): Theme {
  return useSyncExternalStore(subscribeToTheme, getTheme);
}
