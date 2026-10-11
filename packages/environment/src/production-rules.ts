// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { z } from 'zod';

export const PRODUCTION_ENVIRONMENT = 'production';
export const MINIMUM_PRODUCTION_SECRET_LENGTH = 32;

const HTTPS_PROTOCOL = 'https:';
const SECURE_WEBSOCKET_PROTOCOL = 'wss:';
const REQUIRED_SSL_MODE = 'verify-full';
const DEVELOPMENT_MARKERS: readonly string[] = ['_dev_only', '_test_only'];

const HTTPS_REASON = 'em produção deve ser https://';
const WSS_REASON = 'em produção deve ser wss://';
const SSL_MODE_REASON =
  'em produção deve usar sslmode=verify-full (valida o certificado e o nome do servidor)';
const DATABASE_PASSWORD_REASON = `a senha da URL do banco em produção deve ter ao menos ${MINIMUM_PRODUCTION_SECRET_LENGTH} caracteres`;
const SECRET_REASON = `em produção deve ter ao menos ${MINIMUM_PRODUCTION_SECRET_LENGTH} caracteres`;
const MARKER_REASON = 'em produção não pode manter valor de desenvolvimento';

export type ProductionProfile = {
  readonly urlVariables: readonly string[];
  readonly webSocketUrlVariables?: readonly string[];
  readonly secretVariables: readonly string[];
  readonly databaseUrlVariable: string;
};

function textsOf(value: unknown): readonly string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

function hasRequiredSslMode(databaseUrl: string): boolean {
  if (!URL.canParse(databaseUrl)) return false;
  return new URL(databaseUrl).searchParams.get('sslmode') === REQUIRED_SSL_MODE;
}

function hasStrongPassword(databaseUrl: string): boolean {
  if (!URL.canParse(databaseUrl)) return false;
  try {
    return (
      decodeURIComponent(new URL(databaseUrl).password).length >= MINIMUM_PRODUCTION_SECRET_LENGTH
    );
  } catch {
    return false;
  }
}

function isHttpsUrl(value: string): boolean {
  return URL.canParse(value) && new URL(value).protocol === HTTPS_PROTOCOL;
}

function isSecureWebSocketUrl(value: string): boolean {
  return URL.canParse(value) && new URL(value).protocol === SECURE_WEBSOCKET_PROTOCOL;
}

function addViolation(context: z.RefinementCtx, variable: string, reason: string): void {
  context.addIssue({ code: 'custom', message: reason, path: [variable] });
}

// As mensagens são fixas: nenhum valor da configuração volta no erro de boot.
export function checkProductionRules(
  values: Readonly<Record<string, unknown>>,
  profile: ProductionProfile,
  context: z.RefinementCtx,
): void {
  if (values['ENV'] !== PRODUCTION_ENVIRONMENT) return;
  for (const variable of profile.urlVariables) {
    const texts = textsOf(values[variable]);
    if (!texts.every(isHttpsUrl)) addViolation(context, variable, HTTPS_REASON);
  }
  for (const variable of profile.webSocketUrlVariables ?? []) {
    if (!textsOf(values[variable]).every(isSecureWebSocketUrl)) {
      addViolation(context, variable, WSS_REASON);
    }
  }
  const databaseUrl = textsOf(values[profile.databaseUrlVariable])[0] ?? '';
  if (!hasRequiredSslMode(databaseUrl)) {
    addViolation(context, profile.databaseUrlVariable, SSL_MODE_REASON);
  }
  if (!hasStrongPassword(databaseUrl)) {
    addViolation(context, profile.databaseUrlVariable, DATABASE_PASSWORD_REASON);
  }
  for (const variable of profile.secretVariables) {
    const secret = textsOf(values[variable])[0];
    const isTooShort = secret !== undefined && secret.length < MINIMUM_PRODUCTION_SECRET_LENGTH;
    if (isTooShort) addViolation(context, variable, SECRET_REASON);
  }
  for (const [variable, value] of Object.entries(values)) {
    const hasMarker = textsOf(value).some((text) =>
      DEVELOPMENT_MARKERS.some((marker) => text.includes(marker)),
    );
    if (hasMarker) addViolation(context, variable, MARKER_REASON);
  }
}
