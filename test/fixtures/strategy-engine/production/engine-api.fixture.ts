// Copyright (c) 2026 Ada Technology. All rights reserved.
import * as engine from '../../../../packages/strategy-engine/src/index.js';

// A superfície do motor de produção que o juiz exercita. O mesmo tipo descreve o módulo real e as cópias
// mutadas de `src` (engine-mutation.fixture.ts).
export type EngineApi = Pick<typeof engine, 'createEngine' | 'simulatedFillModel' | 'walletStep'>;

export const PRODUCTION_ENGINE_API: EngineApi = {
  createEngine: engine.createEngine,
  simulatedFillModel: engine.simulatedFillModel,
  walletStep: engine.walletStep,
};

export const ENGINE_API_MEMBERS: readonly string[] = [
  'createEngine',
  'simulatedFillModel',
  'walletStep',
];
