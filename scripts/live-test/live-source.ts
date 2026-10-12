// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { createLiveRunDatabase } from '../../apps/worker-ativada/src/live/create-live-run-database.js';
import type { createLiveEvaluator } from '../../apps/worker-ativada/src/live/live-evaluator.js';

const PRODUCTION_SOURCE = new URL('../../apps/worker-ativada/src/live', import.meta.url).pathname;

// O `make live-test` roda contra a produção; o `make live-mutants` o relança apontando esta variável para uma cópia mutada.
export const LIVE_SOURCE_VARIABLE = 'LIVE_MUTANT_SOURCE';

export type LiveSource = {
  readonly createLiveEvaluator: typeof createLiveEvaluator;
  readonly createLiveRunDatabase: typeof createLiveRunDatabase;
};

function readMember(module: unknown, name: string): unknown {
  if (typeof module !== 'object' || module === null) return undefined;
  return Object.getOwnPropertyDescriptor(module, name)?.value;
}

export async function loadLiveSource(): Promise<LiveSource> {
  const source = Bun.env[LIVE_SOURCE_VARIABLE] ?? PRODUCTION_SOURCE;
  const evaluator: unknown = await import(`${source}/live-evaluator.ts`);
  const database: unknown = await import(`${source}/create-live-run-database.ts`);
  const createEvaluatorMember = readMember(evaluator, 'createLiveEvaluator');
  const createDatabaseMember = readMember(database, 'createLiveRunDatabase');
  if (typeof createEvaluatorMember !== 'function' || typeof createDatabaseMember !== 'function') {
    throw new Error('Módulo ao vivo sem a API esperada.');
  }
  return {
    createLiveEvaluator: createEvaluatorMember as LiveSource['createLiveEvaluator'],
    createLiveRunDatabase: createDatabaseMember as LiveSource['createLiveRunDatabase'],
  };
}
