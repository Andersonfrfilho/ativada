// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon } from '../layout/Icon.component.js';
import styles from './Notices.module.css';

// Fechar o aviso (alvo de 44 px): fecha da tela, não marca como lido.
export function ToastCloseButton({ onClose }: { readonly onClose: () => void }): ReactElement {
  return (
    <button type="button" className={styles['close']} aria-label="Fechar aviso" onClick={onClose}>
      <Icon name="close" />
    </button>
  );
}
