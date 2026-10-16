// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon } from '../../layout/Icon.component.js';
import { ANALYST_TEXT } from './analyst.constant.js';
import styles from './Analyst.module.css';

// O selo de quando o analista governa: ele decide pausa, tamanho e saída por tempo (ícone + palavra + cor neutra).
export function GovernSeal(): ReactElement {
  return (
    <span className={styles.seal}>
      <Icon name="check" size={14} />
      {ANALYST_TEXT.GOVERN_SEAL}
    </span>
  );
}
