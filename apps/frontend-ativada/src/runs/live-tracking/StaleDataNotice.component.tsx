// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useClock } from '../../live/useClock.hook.js';
import { formatAge } from './live-pulse.js';
import styles from './LiveTracking.module.css';

const TICK_MILLISECONDS = 1_000;

export type StaleDataNoticeProps = { readonly updatedAt: number };

// A última atualização falhou, mas há dado guardado: a tela fica como estava e só avisa a idade dele.
export function StaleDataNotice({ updatedAt }: StaleDataNoticeProps): ReactElement {
  const now = useClock(TICK_MILLISECONDS);
  return (
    <p role="status" className={`${styles.muted} ${styles.small}`}>
      Não foi possível atualizar agora; dados de {formatAge(now - updatedAt)}.
    </p>
  );
}
