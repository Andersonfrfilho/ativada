// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  checkProductionRules,
  environmentNameSchema,
  httpUrlSchema,
  nonEmptyTextSchema,
  parseEnvironment,
  postgresUrlSchema,
  z,
  type ProductionProfile,
} from '@cryptoada/environment';

import { marketEnvironmentShape } from './market/market-environment.js';

const PRODUCTION_PROFILE: ProductionProfile = {
  urlVariables: ['KEYCLOAK_TOKEN_URL', 'KEYCLOAK_ADMIN_API_URL', 'BINANCE_BASE_URL'],
  secretVariables: ['KEYCLOAK_SERVICE_CLIENT_SECRET'],
  databaseUrlVariable: 'DATABASE_URL',
};

export const environmentSchema = z
  .object({
    ENV: environmentNameSchema,
    DATABASE_URL: postgresUrlSchema,
    KEYCLOAK_TOKEN_URL: httpUrlSchema,
    KEYCLOAK_ADMIN_API_URL: httpUrlSchema,
    KEYCLOAK_SERVICE_CLIENT_ID: nonEmptyTextSchema,
    KEYCLOAK_SERVICE_CLIENT_SECRET: nonEmptyTextSchema,
    ...marketEnvironmentShape,
  })
  .superRefine((values, context) => checkProductionRules(values, PRODUCTION_PROFILE, context));

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(): Environment {
  return parseEnvironment(environmentSchema, process.env);
}
