// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RunStatus, WalkForwardWindowInput } from '@cryptoada/database';
import type { ChainCarry } from '@cryptoada/strategy-engine';

import { commitUnit } from './commit-unit.js';
import { evaluateWindow } from './evaluate-window.js';
import { WALK_FORWARD_ERROR_CODE, WALK_FORWARD_PHASE } from './walk-forward.constant.js';
import { WalkForwardRunError } from './walk-forward.error.js';
import { createSignalCache } from './signal-cache.js';
import { serializeSearchResults, type SearchResults } from './walk-forward-checkpoint.js';
import type { WalkForwardDeps } from './walk-forward-deps.js';
import { OUT_OF_SAMPLE_RECORD_SCHEMA } from './window-record.js';

export type TestPhaseResult =
  | { readonly kind: 'finished' }
  | { readonly kind: 'stopped'; readonly status: RunStatus }
  | { readonly kind: 'vanished' };

// O patrimônio e a régua com que a próxima janela recomeça: os finais da última janela gravada.
function resolveCarry(
  stored: readonly WalkForwardWindowInput[],
  initialBalance: string,
): ChainCarry {
  const last = stored.at(-1);
  if (last === undefined) return { equity: initialBalance, benchmark: initialBalance };
  const parsed = OUT_OF_SAMPLE_RECORD_SCHEMA.safeParse(last.outOfSample);
  if (!parsed.success) {
    throw new WalkForwardRunError(
      WALK_FORWARD_ERROR_CODE.CHECKPOINT_UNUSABLE,
      'A última janela gravada não pode ser lida de volta.',
    );
  }
  return { equity: parsed.data.endEquity, benchmark: parsed.data.endBenchmark };
}

// As janelas gravadas formam um prefixo 0..k−1: é a única forma em que uma retomada é segura.
function assertPrefix(stored: readonly WalkForwardWindowInput[], total: number): void {
  const isPrefix =
    stored.length <= total && stored.every((row, position) => row.windowIndex === position);
  if (!isPrefix) {
    throw new WalkForwardRunError(
      WALK_FORWARD_ERROR_CODE.CHECKPOINT_UNUSABLE,
      'As janelas gravadas não formam um prefixo do plano.',
    );
  }
}

export type TestPhaseParams = {
  readonly deps: WalkForwardDeps;
  readonly results: SearchResults;
  readonly stored: readonly WalkForwardWindowInput[];
};

// O TESTE, janela por janela e em ordem: cada janela grava a linha, os resultados do teste e o checkpoint na MESMA
// transação. Janela concluída não é refeita; o cancelamento é visto entre as janelas.
export async function runTestPhase(params: TestPhaseParams): Promise<TestPhaseResult> {
  const { deps, results, stored } = params;
  const { context } = deps;
  assertPrefix(stored, context.windows.length);
  let carry = resolveCarry(stored, deps.setup.parameters.initialBalance);
  const first = deps.spans[0];
  const last = deps.spans.at(-1);
  if (first === undefined || last === undefined) return { kind: 'finished' };
  const signalsOf = createSignalCache({
    engine: deps.engine,
    series: deps.series,
    setup: deps.setup,
    firstAnchorIndex: first.train.anchorIndex,
    limitIndex: last.test.limitIndex,
  });
  for (const window of context.windows.slice(stored.length)) {
    const evaluation = deps.timer.measureSync(WALK_FORWARD_PHASE.TEST, () =>
      evaluateWindow({ deps, window, results, signalsOf, carry }),
    );
    const committed = await commitUnit({
      session: deps.session,
      rows: evaluation.rows,
      windows: [evaluation.row],
      checkpoint: {
        engineState: serializeSearchResults({ requestHash: context.requestHash, results }),
        lastCandleTime: window.testEnd,
        progress: deps.progress.advance(1),
      },
    });
    if (committed.kind !== 'committed') return committed;
    carry = { equity: evaluation.chained.endEquity, benchmark: evaluation.chained.endBenchmark };
    deps.report(deps.progress.percent());
  }
  return { kind: 'finished' };
}
