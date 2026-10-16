// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './Notices.module.css';
import { useNoticeCenter } from './useNoticeCenter.hook.js';

// RF11: na primeira vez que o sino ganha um aviso, um balão curto aponta para ele. Aparece uma vez; nenhuma tela de configuração obrigatória.
export function NoticeFirstRun(): ReactElement | null {
  const center = useNoticeCenter();
  const { preferences, items, isDrawerOpen } = center;
  if (preferences.hasSeenCoach || items.length === 0 || isDrawerOpen) return null;

  function markSeen(): void {
    center.updatePreferences((current) => ({ ...current, hasSeenCoach: true }));
  }
  function handleAdjust(): void {
    markSeen();
    center.openDrawer();
  }
  return (
    <div className={styles['coach']} role="group" aria-label="Como funcionam os avisos">
      <p className={styles['coachText']}>
        Seus avisos ficam aqui. Já estão ligados para compras, vendas e paradas.
      </p>
      <div className={styles['coachActions']}>
        <button
          type="button"
          className={`${styles['coachButton']} ${styles['coachButtonMain']}`}
          onClick={markSeen}
        >
          Entendi
        </button>
        <button type="button" className={styles['coachButton']} onClick={handleAdjust}>
          Ajustar
        </button>
      </div>
    </div>
  );
}
