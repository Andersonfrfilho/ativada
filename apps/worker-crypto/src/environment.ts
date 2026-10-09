// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseEnvironment, postgresUrlSchema, z } from '@crypto/environment';

export const environmentSchema = z.object({
  ENV: z.enum(['dev', 'test', 'production'], { error: 'dev, test ou production' }),
  DATABASE_URL: postgresUrlSchema,
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(): Environment {
  return parseEnvironment(environmentSchema, process.env);
}
