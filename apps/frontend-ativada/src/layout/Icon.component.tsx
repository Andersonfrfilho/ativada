// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

const DEFAULT_ICON_SIZE = 18;

export const ICON_PATHS = {
  overview: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10',
  goals:
    'M12 3a9 9 0 100 18 9 9 0 000-18zm0 5a4 4 0 100 8 4 4 0 000-8zm0 3a1 1 0 100 2 1 1 0 000-2z',
  horizons: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
  assets: 'M3 7h18v12H3zM3 7l3-4h12l3 4M16 13h2',
  backtests: 'M3 3v18h18M7 15l4-5 3 3 5-7',
  strategies: 'M4 6h16M4 12h10M4 18h6M18 14l2 2-2 2',
  alerts: 'M6 9a6 6 0 1112 0c0 6 2 7 2 7H4s2-1 2-7zM10 20a2 2 0 004 0',
  account: 'M12 4a4 4 0 100 8 4 4 0 000-8zM4 21a8 8 0 0116 0',
  pause: 'M8 5v14M16 5v14',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowDown: 'M12 5v14M19 12l-7 7-7-7',
  equal: 'M5 9h14M5 15h14',
  info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v5M12 7.5v.5',
  alert: 'M12 3L2 21h20zM12 10v4M12 17.5v.5',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  wallet: 'M3 6h18v14H3zM3 10h18M16 15h2',
  check: 'M5 12l5 5 9-10',
  stop: 'M7 6h10a1 1 0 011 1v10a1 1 0 01-1 1H7a1 1 0 01-1-1V7a1 1 0 011-1z',
  chevronRight: 'M9 6l6 6-6 6',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export type IconProps = { readonly name: IconName; readonly size?: number };

export function Icon({ name, size = DEFAULT_ICON_SIZE }: IconProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
