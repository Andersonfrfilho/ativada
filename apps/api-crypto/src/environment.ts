// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseEnvironment, postgresUrlSchema, z } from '@crypto/environment';

const API_PORT_EXPECTATION = 'inteiro entre 1024 e 65535';
const NON_EMPTY_TEXT_EXPECTATION = 'texto não vazio';
const DEFAULT_API_HOST = '127.0.0.1';

export const environmentSchema = z.object({
  ENV: z.enum(['dev', 'test', 'production'], { error: 'dev, test ou production' }),
  DATABASE_URL: postgresUrlSchema,
  API_HOST: z
    .string({ error: NON_EMPTY_TEXT_EXPECTATION })
    .min(1, { error: NON_EMPTY_TEXT_EXPECTATION })
    .default(DEFAULT_API_HOST),
  API_PORT: z.coerce
    .number({ error: API_PORT_EXPECTATION })
    .int({ error: API_PORT_EXPECTATION })
    .min(1024, { error: API_PORT_EXPECTATION })
    .max(65535, { error: API_PORT_EXPECTATION }),
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(): Environment {
  return parseEnvironment(environmentSchema, process.env);
}
