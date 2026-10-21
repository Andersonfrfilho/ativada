// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon } from '../layout/Icon.component.js';
import styles from './Notices.module.css';
import { ToastCloseButton } from './ToastCloseButton.component.js';
import { useNoticeCenter } from './useNoticeCenter.hook.js';
import { useToastLifetime } from './useToastLifetime.hook.js';

// RF20: UM resumo do que aconteceu enquanto a pessoa estava fora; sem som e sem aviso individual.
export function NoticeSummaryToast({ text }: { readonly text: string }): ReactElement {
  const center = useNoticeCenter();
  const hold = useToastLifetime({
    milliseconds: center.toastMilliseconds,
    version: 0,
    isPending: false,
    onExpire: center.dismissSummary,
  });
  function handleOpen(): void {
    center.dismissSummary();
    center.openDrawer();
  }
  return (
    <li className={`${styles['toast']} ${styles['info']}`} {...hold}>
      <div className={styles['head']}>
        <span className={styles['state']}>
          <Icon name="info" size={14} />
          Resumo
        </span>
        <ToastCloseButton onClose={center.dismissSummary} />
      </div>
      <p className={styles['main']}>{text}</p>
      <div className={styles['actions']}>
        <button
          type="button"
          className={`${styles['action']} ${styles['actionMain']}`}
          onClick={handleOpen}
        >
          Ver no sino
        </button>
      </div>
    </li>
  );
}
