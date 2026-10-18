// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import { Icon } from '../layout/Icon.component.js';
import { RUN_KIND } from '../runs/run.constant.js';
import controls from '../styles/Controls.module.css';
import styles from './Wayfinding.module.css';

export type HistoricRunBannerProps = { readonly kind: string };

function kindName(kind: string): string {
  return kind === RUN_KIND.WALK_FORWARD ? 'walk-forward' : 'backtest';
}

// Em backtest e walk-forward a equipe de modelos e os avisos em tempo real não existem: a faixa diz onde estão.
export function HistoricRunBanner({ kind }: HistoricRunBannerProps): ReactElement {
  return (
    <div role="note" aria-label="Execução histórica" className={styles.banner}>
      <p className={styles.bannerText}>
        <strong>Isto é um {kindName(kind)} (histórico).</strong> A equipe de modelos e os avisos em
        tempo real ficam nas simulações ao vivo.
      </p>
      <Link
        to={ROUTE_PATH.LIVE}
        className={`${controls.button} ${controls.primary} ${styles.action}`}
      >
        <Icon name="activity" size={16} />
        Ver simulações ao vivo
      </Link>
    </div>
  );
}
