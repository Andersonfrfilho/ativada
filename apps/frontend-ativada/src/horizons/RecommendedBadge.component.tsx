// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './Horizons.module.css';

// Forma (✓), texto e borda: o selo não depende só da cor para ser visto.
export function RecommendedBadge(): ReactElement {
  return (
    <span className={styles.badge}>
      <span aria-hidden="true">✓ </span>
      Recomendável
    </span>
  );
}
