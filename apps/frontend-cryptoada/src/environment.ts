// Copyright (c) 2026 Ada Technology. All rights reserved.
import { httpUrlSchema, parseEnvironment, z } from '@cryptoada/environment';

export const environmentSchema = z.object({
  VITE_API_URL: httpUrlSchema,
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(
  source: Readonly<Record<string, string | undefined>> = import.meta.env,
): Environment {
  return parseEnvironment(environmentSchema, source);
}
