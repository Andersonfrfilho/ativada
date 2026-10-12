// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { SIMULATION_NOTICE } from '../app/app.constant.js';
import styles from './SimulationNotice.module.css';

// Aviso permanente (RF11): fixo no texto e sem botão de fechar, em todas as rotas.
export function SimulationNotice(): ReactElement {
  return (
    <aside className={styles.notice} role="note" aria-label="Aviso de simulação">
      <p>{SIMULATION_NOTICE}</p>
    </aside>
  );
}
