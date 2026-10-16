// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import { Icon } from '../layout/Icon.component.js';
import controls from '../styles/Controls.module.css';
import styles from './Notices.module.css';
import { useNoticeCenter } from './useNoticeCenter.hook.js';

// RF10: o vazio amigável, com o caminho para quem ainda não tem nenhuma simulação.
export function NoticeEmpty(): ReactElement {
  const { closeDrawer } = useNoticeCenter();
  return (
    <div className={styles['empty']}>
      <span className={styles['emptyArt']}>
        <Icon name="alerts" size={40} />
      </span>
      <h3>Sem avisos ainda</h3>
      <p>Quando uma simulação comprar ou vender, aparece aqui.</p>
      <Link
        className={`${controls.button} ${controls.primary}`}
        to={ROUTE_PATH.BACKTESTS}
        onClick={closeDrawer}
      >
        Começar uma simulação
      </Link>
    </div>
  );
}
