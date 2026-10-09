// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  checkProductionRules,
  parseEnvironment,
  postgresUrlSchema,
  z,
  type ProductionProfile,
} from '@crypto/environment';

const URL_EXPECTATION = 'URL http:// ou https://';
const NON_EMPTY_TEXT_EXPECTATION = 'texto não vazio';

const httpUrlSchema = z.url({ protocol: /^https?$/, error: URL_EXPECTATION });
const nonEmptyTextSchema = z
  .string({ error: NON_EMPTY_TEXT_EXPECTATION })
  .min(1, { error: NON_EMPTY_TEXT_EXPECTATION });

const PRODUCTION_PROFILE: ProductionProfile = {
  urlVariables: ['KEYCLOAK_TOKEN_URL', 'KEYCLOAK_ADMIN_API_URL'],
  secretVariables: ['KEYCLOAK_SERVICE_CLIENT_SECRET'],
  databaseUrlVariable: 'DATABASE_URL',
};

export const environmentSchema = z
  .object({
    ENV: z.enum(['dev', 'test', 'production'], { error: 'dev, test ou production' }),
    DATABASE_URL: postgresUrlSchema,
    KEYCLOAK_TOKEN_URL: httpUrlSchema,
    KEYCLOAK_ADMIN_API_URL: httpUrlSchema,
    KEYCLOAK_SERVICE_CLIENT_ID: nonEmptyTextSchema,
    KEYCLOAK_SERVICE_CLIENT_SECRET: nonEmptyTextSchema,
  })
  .superRefine((values, context) => checkProductionRules(values, PRODUCTION_PROFILE, context));

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(): Environment {
  return parseEnvironment(environmentSchema, process.env);
}
