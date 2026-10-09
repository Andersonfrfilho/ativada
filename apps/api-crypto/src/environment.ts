// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseEnvironment, postgresUrlSchema, z } from '@crypto/environment';

const API_PORT_EXPECTATION = 'inteiro entre 1024 e 65535';
const NON_EMPTY_TEXT_EXPECTATION = 'texto não vazio';
const URL_EXPECTATION = 'URL http:// ou https://';
const ORIGIN_LIST_EXPECTATION =
  'lista de origens exatas separadas por vírgula (https://host[:porta], sem caminho nem barra final)';
const TEXT_LIST_EXPECTATION = 'lista de textos separados por vírgula';
const PROXY_HOPS_EXPECTATION = 'inteiro entre 0 e 10';
const DEFAULT_API_HOST = '127.0.0.1';
const MAX_TRUSTED_PROXY_HOPS = 10;

function splitCommaSeparatedList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function isExactOrigin(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const parsed = new URL(value);
  return parsed.origin === value && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
}

const nonEmptyTextSchema = z
  .string({ error: NON_EMPTY_TEXT_EXPECTATION })
  .min(1, { error: NON_EMPTY_TEXT_EXPECTATION });

const httpUrlSchema = z.url({ protocol: /^https?$/, error: URL_EXPECTATION });

const textListSchema = z
  .string({ error: TEXT_LIST_EXPECTATION })
  .transform(splitCommaSeparatedList)
  .pipe(z.array(nonEmptyTextSchema).min(1, { error: TEXT_LIST_EXPECTATION }));

const originListSchema = z
  .string({ error: ORIGIN_LIST_EXPECTATION })
  .transform(splitCommaSeparatedList)
  .pipe(
    z
      .array(z.string().refine(isExactOrigin, { error: ORIGIN_LIST_EXPECTATION }))
      .min(1, { error: ORIGIN_LIST_EXPECTATION }),
  );

export const environmentSchema = z.object({
  ENV: z.enum(['dev', 'test', 'production'], { error: 'dev, test ou production' }),
  DATABASE_URL: postgresUrlSchema,
  API_HOST: nonEmptyTextSchema.default(DEFAULT_API_HOST),
  API_PORT: z.coerce
    .number({ error: API_PORT_EXPECTATION })
    .int({ error: API_PORT_EXPECTATION })
    .min(1024, { error: API_PORT_EXPECTATION })
    .max(65535, { error: API_PORT_EXPECTATION }),
  KEYCLOAK_ISSUER: httpUrlSchema,
  KEYCLOAK_JWKS_URL: httpUrlSchema,
  API_AUDIENCE: nonEmptyTextSchema,
  AUTHORIZED_PARTIES: textListSchema,
  CORS_ALLOWED_ORIGINS: originListSchema,
  TRUSTED_PROXY_HOPS: z.coerce
    .number({ error: PROXY_HOPS_EXPECTATION })
    .int({ error: PROXY_HOPS_EXPECTATION })
    .min(0, { error: PROXY_HOPS_EXPECTATION })
    .max(MAX_TRUSTED_PROXY_HOPS, { error: PROXY_HOPS_EXPECTATION })
    .default(0),
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(): Environment {
  return parseEnvironment(environmentSchema, process.env);
}
