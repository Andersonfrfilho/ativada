// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Term } from '../../glossary/Term.component.js';
import { Icon } from '../../layout/Icon.component.js';
import { ANALYST_TEXT } from './analyst.constant.js';
import styles from './Analyst.module.css';

// O selo do modo sombra: o analista só observa e a simulação segue a estratégia sem mudança (ícone + palavra + cor neutra).
export function ShadowSeal(): ReactElement {
  return (
    <span className={styles.seal}>
      <Icon name="eye" size={14} />
      <Term term="shadowMode">{ANALYST_TEXT.SHADOW_SEAL}</Term>
    </span>
  );
}
