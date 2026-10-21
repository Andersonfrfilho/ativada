// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon } from '../layout/Icon.component.js';
import styles from './Wayfinding.module.css';

// Ícone + palavra + cor: quem abre uma simulação ao vivo sabe disso em um olhar.
export function LiveBadge(): ReactElement {
  return (
    <span className={styles.badge}>
      <Icon name="activity" size={16} />
      Ao vivo
    </span>
  );
}
