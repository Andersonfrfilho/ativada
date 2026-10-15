// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement, ReactNode } from 'react';

import { Icon, type IconName } from '../../layout/Icon.component.js';
import styles from './LiveTracking.module.css';

export const CHIP_TONE = {
  NEUTRAL: 'neutral',
  BUY: 'buy',
  SELL: 'sell',
  WARN: 'warn',
  INFO: 'info',
} as const;

export type ChipTone = (typeof CHIP_TONE)[keyof typeof CHIP_TONE];

const TONE_CLASS: Readonly<Record<ChipTone, string | undefined>> = {
  neutral: undefined,
  buy: styles.buy,
  sell: styles.sell,
  warn: styles.warn,
  info: styles.info,
};

export type StatusChipProps = {
  readonly tone?: ChipTone;
  readonly icon?: IconName;
  readonly children: ReactNode;
};

// Estado = ícone + palavra + cor: o selo nunca depende só da cor.
export function StatusChip({
  tone = CHIP_TONE.NEUTRAL,
  icon,
  children,
}: StatusChipProps): ReactElement {
  const toneClass = TONE_CLASS[tone];
  return (
    <span className={toneClass === undefined ? styles.chip : `${styles.chip} ${toneClass}`}>
      {icon === undefined ? null : <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}
