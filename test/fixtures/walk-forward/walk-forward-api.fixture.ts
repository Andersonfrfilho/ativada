// Copyright (c) 2026 Ada Technology. All rights reserved.
import type * as EngineModule from '../../../packages/strategy-engine/src/index.js';
import {
  createStrategyVersion,
  type StrategyVersion,
} from '../../../packages/strategy-engine/src/index.js';
import classicStrategy from '../strategy-engine/classic-scoreboard.strategy.json';

const FIRST_PRNG_CONSTANT = 0x6d2b79f5;
const UINT32_RANGE = 4_294_967_296;

// PRNG inteiro de semente fixa (mulberry32): as propriedades repetem em qualquer máquina.
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + FIRST_PRNG_CONSTANT) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

export function pickInteger(random: () => number, minimum: number, maximum: number): number {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

export function buildClassicStrategy(): StrategyVersion {
  return createStrategyVersion(classicStrategy);
}

export const EMA_RULE_ID = 'ema-9-21';
export const EMA_FAST_PATH = `rules.${EMA_RULE_ID}.fastPeriod`;
export const EMA_SLOW_PATH = `rules.${EMA_RULE_ID}.slowPeriod`;

export function integerRange(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_unused, offset) => first + offset);
}

const PRODUCTION_ENGINE_SOURCE = new URL('../../../packages/strategy-engine/src', import.meta.url)
  .pathname;

// Os testes do domínio rodam contra a produção; o teste de mutantes os relança num processo à parte
// apontando esta variável para uma cópia mutada do `src` do motor.
export const WALK_FORWARD_ENGINE_SOURCE_VARIABLE = 'WALK_FORWARD_ENGINE_SOURCE';

export type WalkForwardEngineApi = typeof EngineModule;

export async function loadWalkForwardEngineApi(): Promise<WalkForwardEngineApi> {
  const root = Bun.env[WALK_FORWARD_ENGINE_SOURCE_VARIABLE] ?? PRODUCTION_ENGINE_SOURCE;
  const module: unknown = await import(`${root}/index.ts`);
  return module as WalkForwardEngineApi;
}
