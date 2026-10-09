// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseEnvironment, z } from '@crypto/environment';

const DATABASE_URL_EXPECTATION = 'URL postgres:// ou postgresql://';

export const environmentSchema = z.object({
  ENV: z.enum(['dev', 'test', 'production'], { error: 'dev, test ou production' }),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: DATABASE_URL_EXPECTATION }),
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(): Environment {
  return parseEnvironment(environmentSchema, process.env);
}
