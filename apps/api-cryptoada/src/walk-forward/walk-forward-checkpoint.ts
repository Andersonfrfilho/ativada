// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCheckpoint, JsonContainer } from '@cryptoada/database';
import { z } from '@cryptoada/environment';

import { isJsonContainer } from '../backtest/json-container.js';
import {
  WALK_FORWARD_CHECKPOINT_KIND,
  WALK_FORWARD_CHECKPOINT_VERSION,
  WALK_FORWARD_ERROR_CODE,
} from './walk-forward.constant.js';
import { WalkForwardRunError } from './walk-forward.error.js';
import { WINDOW_SUMMARY_SCHEMA } from './search-messages.js';
import type { WindowSummary } from './search-input.js';

const HASH_LENGTH = 64;

// O checkpoint da busca: o resumo do AJUSTE de cada combinação já avaliada. A busca é a parte cara; com ele uma
// retomada só avalia o que falta. O pedido (grade e janelas) entra pelo hash: outro pedido não retoma este.
const CHECKPOINT_SCHEMA = z.strictObject({
  kind: z.literal(WALK_FORWARD_CHECKPOINT_KIND),
  version: z.literal(WALK_FORWARD_CHECKPOINT_VERSION),
  requestHash: z.string().length(HASH_LENGTH),
  combinations: z.record(z.string(), z.array(WINDOW_SUMMARY_SCHEMA)),
});

export type SearchResults = Map<number, readonly WindowSummary[]>;

function unusable(): WalkForwardRunError {
  return new WalkForwardRunError(
    WALK_FORWARD_ERROR_CODE.CHECKPOINT_UNUSABLE,
    'O checkpoint não pode ser retomado; refaça a execução desde o início.',
  );
}

// Sem checkpoint (nenhum resumo chegou a gravar) a busca recomeça do zero.
export function restoreSearchResults(params: {
  readonly checkpoint: EngineCheckpoint | undefined;
  readonly requestHash: string;
  readonly combinations: number;
  readonly windows: number;
}): SearchResults {
  const results: SearchResults = new Map();
  if (params.checkpoint?.engineState === undefined) return results;
  const parsed = CHECKPOINT_SCHEMA.safeParse(params.checkpoint.engineState);
  if (!parsed.success) throw unusable();
  if (parsed.data.requestHash !== params.requestHash) {
    throw new WalkForwardRunError(
      WALK_FORWARD_ERROR_CODE.OPTIONS_MISMATCH,
      'O pedido do walk-forward é outro que o do checkpoint.',
    );
  }
  for (const [key, windows] of Object.entries(parsed.data.combinations)) {
    const index = Number(key);
    const isOwn =
      Number.isInteger(index) &&
      index >= 0 &&
      index < params.combinations &&
      windows.length === params.windows;
    if (!isOwn) throw unusable();
    results.set(index, windows);
  }
  return results;
}

export function serializeSearchResults(params: {
  readonly requestHash: string;
  readonly results: SearchResults;
}): JsonContainer {
  const combinations: Record<string, readonly WindowSummary[]> = {};
  for (const index of [...params.results.keys()].sort((first, second) => first - second)) {
    combinations[String(index)] = params.results.get(index) ?? [];
  }
  const payload: unknown = JSON.parse(
    JSON.stringify({
      kind: WALK_FORWARD_CHECKPOINT_KIND,
      version: WALK_FORWARD_CHECKPOINT_VERSION,
      requestHash: params.requestHash,
      combinations,
    }),
  );
  if (!isJsonContainer(payload)) throw unusable();
  return payload;
}
