// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseEnvironment, postgresUrlSchema, z } from '@crypto/environment';

const URL_EXPECTATION = 'URL http:// ou https://';
const NON_EMPTY_TEXT_EXPECTATION = 'texto não vazio';

const httpUrlSchema = z.url({ protocol: /^https?$/, error: URL_EXPECTATION });
const nonEmptyTextSchema = z
  .string({ error: NON_EMPTY_TEXT_EXPECTATION })
  .min(1, { error: NON_EMPTY_TEXT_EXPECTATION });

export const environmentSchema = z.object({
  ENV: z.enum(['dev', 'test', 'production'], { error: 'dev, test ou production' }),
  DATABASE_URL: postgresUrlSchema,
  KEYCLOAK_TOKEN_URL: httpUrlSchema,
  KEYCLOAK_ADMIN_API_URL: httpUrlSchema,
  KEYCLOAK_SERVICE_CLIENT_ID: nonEmptyTextSchema,
  KEYCLOAK_SERVICE_CLIENT_SECRET: nonEmptyTextSchema,
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(): Environment {
  return parseEnvironment(environmentSchema, process.env);
}
