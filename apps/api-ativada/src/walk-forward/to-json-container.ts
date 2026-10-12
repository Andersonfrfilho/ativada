// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonContainer } from '@ativada/database';

import { isJsonContainer } from '@ativada/run-recording';

// Uma cópia só-JSON do valor, no formato que o repositório aceita para `jsonb` (objeto ou lista no topo).
export function toJsonContainer(value: unknown): JsonContainer {
  const copy: unknown = JSON.parse(JSON.stringify(value));
  if (!isJsonContainer(copy)) throw new TypeError('Esperado objeto ou lista JSON.');
  return copy;
}
