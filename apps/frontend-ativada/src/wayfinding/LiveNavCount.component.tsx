// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './Wayfinding.module.css';
import { useRunningLiveCount } from './useRunningLiveCount.hook.js';

// O número de simulações rodando agora ao lado de "Ao vivo"; sem nenhuma rodando, nada aparece.
export function LiveNavCount(): ReactElement | null {
  const count = useRunningLiveCount();
  if (count === 0) return null;
  return (
    <span role="img" aria-label={`${count} rodando agora`} className={styles.count}>
      {count}
    </span>
  );
}
