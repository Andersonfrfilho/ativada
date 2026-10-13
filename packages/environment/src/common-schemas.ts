// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from 'zod';

import { PRODUCTION_ENVIRONMENT } from './production-rules.js';

const URL_EXPECTATION = 'URL http:// ou https://';
const WEBSOCKET_URL_EXPECTATION = 'URL ws:// ou wss://';
const NON_EMPTY_TEXT_EXPECTATION = 'texto não vazio';
const ENV_EXPECTATION = 'dev, test ou production';
const PEM_EXPECTATION =
  'certificado(s) PEM (-----BEGIN CERTIFICATE----- ... -----END CERTIFICATE-----)';
const MAX_PEM_LENGTH = 65_536;
const PEM_CERTIFICATE_PATTERN =
  /^\s*-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----\s*$/;

export const DATABASE_QUERY_TIMEOUT_MINIMUM_SECONDS = 5;
export const DATABASE_QUERY_TIMEOUT_MAXIMUM_SECONDS = 300;
export const DATABASE_QUERY_TIMEOUT_DEFAULT_SECONDS = 30;
const DATABASE_QUERY_TIMEOUT_EXPECTATION = `inteiro de ${DATABASE_QUERY_TIMEOUT_MINIMUM_SECONDS} a ${DATABASE_QUERY_TIMEOUT_MAXIMUM_SECONDS}`;

export const httpUrlSchema = z.url({ protocol: /^https?$/, error: URL_EXPECTATION });

export const webSocketUrlSchema = z.url({
  protocol: /^wss?$/,
  error: WEBSOCKET_URL_EXPECTATION,
});

export const nonEmptyTextSchema = z
  .string({ error: NON_EMPTY_TEXT_EXPECTATION })
  .min(1, { error: NON_EMPTY_TEXT_EXPECTATION });

export const environmentNameSchema = z.enum(['dev', 'test', PRODUCTION_ENVIRONMENT], {
  error: ENV_EXPECTATION,
});

const LIST_SEPARATOR = ',';

export const commaSeparatedTextSchema = z
  .string()
  .transform((text) => text.split(LIST_SEPARATOR).map((entry) => entry.trim()));

// Teto de tempo por consulta ou transação: sem ele, uma conexão muda prende a ronda para sempre (ADR 0002, spec 006 R4).
export const databaseQueryTimeoutSecondsSchema = z.coerce
  .number({ error: DATABASE_QUERY_TIMEOUT_EXPECTATION })
  .int({ error: DATABASE_QUERY_TIMEOUT_EXPECTATION })
  .min(DATABASE_QUERY_TIMEOUT_MINIMUM_SECONDS, { error: DATABASE_QUERY_TIMEOUT_EXPECTATION })
  .max(DATABASE_QUERY_TIMEOUT_MAXIMUM_SECONDS, { error: DATABASE_QUERY_TIMEOUT_EXPECTATION })
  .default(DATABASE_QUERY_TIMEOUT_DEFAULT_SECONDS);

// A CA (ou a cadeia) em PEM, para um serviço que o sistema operacional não conhece (o Postgres do Railway): o valor
// pode vir de uma variável de uma linha só, com `\n` literal no lugar das quebras.
export const pemCertificateSchema = z
  .string({ error: PEM_EXPECTATION })
  .max(MAX_PEM_LENGTH, { error: PEM_EXPECTATION })
  .transform((text) => text.replaceAll(String.raw`\n`, '\n'))
  .pipe(z.string().regex(PEM_CERTIFICATE_PATTERN, { error: PEM_EXPECTATION }));
