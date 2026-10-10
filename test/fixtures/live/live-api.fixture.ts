// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { createLiveEvaluator } from '../../../apps/worker-cryptoada/src/live/live-evaluator.js';
import type { createLiveScheduler } from '../../../apps/worker-cryptoada/src/live/live-scheduler.js';

const PRODUCTION_SOURCE = new URL('../../../apps/worker-cryptoada/src/live', import.meta.url)
  .pathname;

// Os testes da simulação ao vivo rodam contra a produção; o teste de mutantes os relança num processo à parte
// apontando esta variável para uma cópia mutada do módulo.
export const LIVE_MUTANT_VARIABLE = 'LIVE_MUTANT_SOURCE';

export type LiveApi = {
  readonly createLiveEvaluator: typeof createLiveEvaluator;
  readonly createLiveScheduler: typeof createLiveScheduler;
};

export function resolveLiveSource(): string {
  return Bun.env[LIVE_MUTANT_VARIABLE] ?? PRODUCTION_SOURCE;
}

function readMember(module: unknown, name: string): unknown {
  if (typeof module !== 'object' || module === null) return undefined;
  return Object.getOwnPropertyDescriptor(module, name)?.value;
}

export async function loadLiveApi(): Promise<LiveApi> {
  const source = resolveLiveSource();
  const evaluator: unknown = await import(`${source}/live-evaluator.ts`);
  const scheduler: unknown = await import(`${source}/live-scheduler.ts`);
  const createLiveEvaluatorMember = readMember(evaluator, 'createLiveEvaluator');
  const createLiveSchedulerMember = readMember(scheduler, 'createLiveScheduler');
  if (
    typeof createLiveEvaluatorMember !== 'function' ||
    typeof createLiveSchedulerMember !== 'function'
  ) {
    throw new Error('Módulo ao vivo sem a API esperada.');
  }
  return {
    createLiveEvaluator: createLiveEvaluatorMember as LiveApi['createLiveEvaluator'],
    createLiveScheduler: createLiveSchedulerMember as LiveApi['createLiveScheduler'],
  };
}
