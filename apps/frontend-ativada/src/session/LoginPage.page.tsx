// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement } from 'react';
import { Navigate } from 'react-router';

import { APP_NAME, ROUTE_PATH } from '../app/app.constant.js';
import {
  useAppConfig,
  useSessionStatus,
  useUnconfirmedSignOut,
} from '../app/useAppContext.hook.js';
import controls from '../styles/Controls.module.css';
import styles from './LoginPage.module.css';
import { startLogin } from './login-redirect.js';
import { LOADING_TEXT, SESSION_STATUS, UNCONFIRMED_SIGN_OUT_TEXT } from './session.constant.js';

export function LoginPage(): ReactElement {
  const config = useAppConfig();
  const status = useSessionStatus();
  const hasUnconfirmedSignOut = useUnconfirmedSignOut();
  const [isRedirecting, setIsRedirecting] = useState(false);

  if (status === SESSION_STATUS.AUTHENTICATED) return <Navigate to={ROUTE_PATH.OVERVIEW} replace />;
  if (status === SESSION_STATUS.LOADING) return <p role="status">{LOADING_TEXT}</p>;

  async function handleLogin(): Promise<void> {
    setIsRedirecting(true);
    await startLogin({
      config,
      storage: window.sessionStorage,
      navigate: (url) => window.location.assign(url),
    });
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{APP_NAME}</h1>
        <p className={styles.lead}>
          Teste estratégias e receba sinais sobre preços reais, sem arriscar dinheiro de verdade.
        </p>
        {hasUnconfirmedSignOut ? (
          <p role="alert" className={controls.error}>
            {UNCONFIRMED_SIGN_OUT_TEXT}
          </p>
        ) : null}
        <button
          type="button"
          className={`${controls.button} ${controls.primary}`}
          disabled={isRedirecting}
          onClick={() => void handleLogin()}
        >
          Entrar com Keycloak
        </button>
        <p className={controls.muted}>O acesso é por convite. O login é feito no Keycloak.</p>
      </div>
    </main>
  );
}
