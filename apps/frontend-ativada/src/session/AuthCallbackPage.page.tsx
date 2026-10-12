// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import { useSessionService } from '../app/useAppContext.hook.js';
import { buildRedirectUri, consumeLoginAttempt } from './login-redirect.js';
import styles from './LoginPage.module.css';
import type { SessionService } from './session-service.js';

const CODE_PARAM = 'code';
const STATE_PARAM = 'state';
const ERROR_PARAM = 'error';

type CompleteLoginParams = {
  readonly session: SessionService;
  readonly code: string;
  readonly state: string;
};

async function completeLogin(params: CompleteLoginParams): Promise<boolean> {
  const attempt = consumeLoginAttempt(window.sessionStorage, params.state);
  if (attempt === undefined) return false;
  try {
    await params.session.exchangeCode({
      code: params.code,
      codeVerifier: attempt.codeVerifier,
      redirectUri: buildRedirectUri(window.location.origin),
    });
    return true;
  } catch {
    return false;
  }
}

export function AuthCallbackPage(): ReactElement {
  const session = useSessionService();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hasStarted = useRef(false);
  const [hasFailed, setHasFailed] = useState(false);
  const code = searchParams.get(CODE_PARAM);
  const state = searchParams.get(STATE_PARAM);
  const hasProviderError = searchParams.has(ERROR_PARAM);

  // Troca o código uma única vez (o React em desenvolvimento roda o efeito duas vezes).
  useEffect(() => {
    if (code === null || state === null || hasProviderError || hasStarted.current) return;
    hasStarted.current = true;
    async function run(): Promise<void> {
      if (code === null || state === null) return;
      const isSuccess = await completeLogin({ session, code, state });
      if (isSuccess) void navigate(ROUTE_PATH.OVERVIEW, { replace: true });
      else setHasFailed(true);
    }
    void run();
  }, [code, state, hasProviderError, session, navigate]);

  if (code === null || state === null || hasProviderError || hasFailed) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <p role="alert">Não foi possível entrar. Tente novamente.</p>
          <Link to={ROUTE_PATH.LOGIN}>Voltar ao login</Link>
        </div>
      </main>
    );
  }
  return <p role="status">Entrando…</p>;
}
