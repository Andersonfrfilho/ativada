// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { createLiveEvaluator } from '../../../apps/worker-cryptoada/src/live/live-evaluator.js';
import type {
  buildStepAlert,
  isAlertableSignal,
} from '../../../apps/worker-cryptoada/src/live/build-step-alert.js';
import type { alertPayloadSchema } from '../../../apps/worker-cryptoada/src/live/alert-payload.schema.js';
import type { parseHitRate } from '../../../apps/worker-cryptoada/src/live/hit-rate.js';
import type {
  buildGoalCommands,
  decideGoalStep,
  isWalletSettled,
  loadGoalTracking,
} from '../../../apps/worker-cryptoada/src/live/goal-step.js';
import type { buildGoalAlert } from '../../../apps/worker-cryptoada/src/live/goal-alert.js';
import type { goalAlertPayloadSchema } from '../../../apps/worker-cryptoada/src/live/alert-payload.schema.js';
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

export type LiveAlertParts = {
  readonly parseHitRate: typeof parseHitRate;
  readonly alertPayloadSchema: typeof alertPayloadSchema;
  readonly buildStepAlert: typeof buildStepAlert;
  readonly isAlertableSignal: typeof isAlertableSignal;
};

export type LiveGoalParts = {
  readonly loadGoalTracking: typeof loadGoalTracking;
  readonly decideGoalStep: typeof decideGoalStep;
  readonly buildGoalCommands: typeof buildGoalCommands;
  readonly isWalletSettled: typeof isWalletSettled;
  readonly buildGoalAlert: typeof buildGoalAlert;
  readonly goalAlertPayloadSchema: typeof goalAlertPayloadSchema;
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

// A leitura do acerto histórico e o esquema do conteúdo do alerta vivem ao lado do avaliador, então os mutantes os alcançam.
export async function loadLiveAlertParts(): Promise<LiveAlertParts> {
  const source = resolveLiveSource();
  const hitRate: unknown = await import(`${source}/hit-rate.ts`);
  const payload: unknown = await import(`${source}/alert-payload.schema.ts`);
  const parseHitRateMember = readMember(hitRate, 'parseHitRate');
  const schemaMember = readMember(payload, 'alertPayloadSchema');
  const builder: unknown = await import(`${source}/build-step-alert.ts`);
  const buildMember = readMember(builder, 'buildStepAlert');
  const alertableMember = readMember(builder, 'isAlertableSignal');
  if (
    typeof parseHitRateMember !== 'function' ||
    typeof schemaMember !== 'object' ||
    typeof buildMember !== 'function' ||
    typeof alertableMember !== 'function'
  ) {
    throw new Error('Módulo ao vivo sem as partes do alerta.');
  }
  return {
    parseHitRate: parseHitRateMember as LiveAlertParts['parseHitRate'],
    alertPayloadSchema: schemaMember as LiveAlertParts['alertPayloadSchema'],
    buildStepAlert: buildMember as LiveAlertParts['buildStepAlert'],
    isAlertableSignal: alertableMember as LiveAlertParts['isAlertableSignal'],
  };
}

// A decisão da meta no passo ao vivo (alvo, perda máxima, prazo), os comandos de saída e o alerta de desfecho.
export async function loadLiveGoalParts(): Promise<LiveGoalParts> {
  const source = resolveLiveSource();
  const step: unknown = await import(`${source}/goal-step.ts`);
  const alert: unknown = await import(`${source}/goal-alert.ts`);
  const payload: unknown = await import(`${source}/alert-payload.schema.ts`);
  const members = {
    loadGoalTracking: readMember(step, 'loadGoalTracking'),
    decideGoalStep: readMember(step, 'decideGoalStep'),
    buildGoalCommands: readMember(step, 'buildGoalCommands'),
    isWalletSettled: readMember(step, 'isWalletSettled'),
    buildGoalAlert: readMember(alert, 'buildGoalAlert'),
    goalAlertPayloadSchema: readMember(payload, 'goalAlertPayloadSchema'),
  };
  if (Object.values(members).some((member) => member === undefined)) {
    throw new Error('Módulo ao vivo sem as partes da meta.');
  }
  return members as LiveGoalParts;
}
