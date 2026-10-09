// Copyright (c) 2026 Ada Technology. All rights reserved.
export const INVITATION_ACTIONS: readonly string[] = ['VERIFY_EMAIL', 'UPDATE_PASSWORD'];
export const INVITATION_LIFESPAN_SECONDS = 86_400;
export const IDENTITY_REQUEST_TIMEOUT_MILLISECONDS = 5_000;
export const TOKEN_EXPIRY_MARGIN_SECONDS = 15;
export const MILLISECONDS_PER_SECOND = 1_000;

export const IDENTITY_OUTCOME = {
  OK: 'ok',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  UNAVAILABLE: 'unavailable',
} as const;

export const CLIENT_CREDENTIALS_GRANT = 'client_credentials';

// Corpo que o Keycloak devolve quando o usuário não existe; 404 sem ele é realm ou URL errados.
export const KEYCLOAK_USER_NOT_FOUND_ERROR = 'User not found';
