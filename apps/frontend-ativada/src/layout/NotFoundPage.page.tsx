// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import controls from '../styles/Controls.module.css';
import styles from '../session/LoginPage.module.css';

export function NotFoundPage(): ReactElement {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Página não encontrada</h1>
        <Link to={ROUTE_PATH.OVERVIEW} className={controls.textLink}>
          Voltar à visão geral
        </Link>
      </div>
    </main>
  );
}
