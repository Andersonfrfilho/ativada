// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseEnvironment, z } from '@crypto/environment';

const HTTP_URL_EXPECTATION = 'URL http:// ou https://';

export const environmentSchema = z.object({
  VITE_API_URL: z.url({ protocol: /^https?$/, error: HTTP_URL_EXPECTATION }),
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(
  source: Readonly<Record<string, string | undefined>> = import.meta.env,
): Environment {
  return parseEnvironment(environmentSchema, source);
}
