// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

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
} as const;

export type IconName = keyof typeof ICON_PATHS;

export type IconProps = { readonly name: IconName };

export function Icon({ name }: IconProps): ReactElement {
  return (
    <svg
      width="18"
      height="18"
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
