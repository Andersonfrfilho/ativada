// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Navigate, Outlet } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import {
  useRenewalProblem,
  useSessionService,
  useSessionStatus,
} from '../app/useAppContext.hook.js';
import controls from '../styles/Controls.module.css';
import styles from './LoginPage.module.css';
import {
  LOADING_TEXT,
  RENEWAL_PROBLEM_TEXT,
  SESSION_STATUS,
  SESSION_UNAVAILABLE_TEXT,
} from './session.constant.js';

export function RequireSession(): ReactElement {
  const session = useSessionService();
  const status = useSessionStatus();
  const hasRenewalProblem = useRenewalProblem();
  if (status === SESSION_STATUS.LOADING) return <p role="status">{LOADING_TEXT}</p>;
  if (status === SESSION_STATUS.ANONYMOUS) return <Navigate to={ROUTE_PATH.LOGIN} replace />;
  if (status === SESSION_STATUS.UNAVAILABLE) {
    return (
      <div role="alert" className={styles.unavailable}>
        <p>{SESSION_UNAVAILABLE_TEXT}</p>
        <button type="button" className={controls.button} onClick={() => void session.renew()}>
          Tentar de novo
        </button>
      </div>
    );
  }
  return (
    <>
      {hasRenewalProblem ? (
        <div role="status" aria-label="Aviso da sessão" className={styles.renewalNotice}>
          <span>{RENEWAL_PROBLEM_TEXT}</span>{' '}
          <button type="button" className={controls.button} onClick={() => void session.renew()}>
            Tentar renovar agora
          </button>
        </div>
      ) : null}
      <Outlet />
    </>
  );
}
