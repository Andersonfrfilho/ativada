// Copyright (c) 2026 Ada Technology. All rights reserved.
export const SESSION_STATUS = {
  LOADING: 'loading',
  AUTHENTICATED: 'authenticated',
  ANONYMOUS: 'anonymous',
  UNAVAILABLE: 'unavailable',
} as const;

export type SessionStatus = (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

// Renova antes de o token vencer, para não mandar à API um token que expira no caminho.
export const TOKEN_EXPIRY_MARGIN_MILLISECONDS = 30_000;
export const MILLISECONDS_PER_SECOND = 1_000;
export const LOGIN_ATTEMPT_STORAGE_KEY = 'ativada-login-attempt';
export const LOGIN_SCOPE = 'openid email profile';
export const LOADING_TEXT = 'Carregando…';
export const SESSION_UNAVAILABLE_TEXT = 'Não foi possível verificar sua sessão agora.';
// Respostas assim dizem que a sessão ainda pode existir (limite de uso, servidor ou rede fora).
export const TRANSIENT_FAILURE_STATUSES: readonly number[] = [429];
export const SERVER_ERROR_MIN_STATUS = 500;
// Com a renovação falhando, não insiste a cada requisição: espera um pouco antes de tentar de novo.
export const RENEWAL_RETRY_MILLISECONDS = 5_000;
export const RENEWAL_PROBLEM_TEXT =
  'Não foi possível renovar a sessão agora. Você segue conectado por mais alguns instantes; tentaremos de novo.';
export const UNCONFIRMED_SIGN_OUT_TEXT =
  'Você saiu deste navegador, mas não conseguimos confirmar o encerramento no servidor: a sessão pode continuar válida. Entre e saia de novo, ou feche este navegador.';
