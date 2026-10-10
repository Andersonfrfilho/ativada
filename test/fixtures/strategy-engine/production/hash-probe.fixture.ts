// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { WalletStepInput } from '../../../../packages/strategy-engine/src/index.js';
import type { EngineApi } from './engine-api.fixture.js';
import { guardInput, GUARD_STRATEGY } from './wallet-guard-cases.fixture.js';

// A configuração enumerada conta quantas vezes o motor a reparseou para recalcular o hash: o mesmo objeto
// congelado só pode custar um SHA-256, não um por passo.
export function countEnumerationsAfterEachCall(
  walletStep: EngineApi['walletStep'],
  calls: number,
): readonly number[] {
  let enumerations = 0;
  const countedConfig = new Proxy(GUARD_STRATEGY.config, {
    ownKeys(target): (string | symbol)[] {
      enumerations += 1;
      return Reflect.ownKeys(target);
    },
  });
  const strategy = Object.freeze({ ...GUARD_STRATEGY, config: countedConfig });
  const input: WalletStepInput = { ...guardInput(), strategy };
  return Array.from({ length: calls }, () => {
    walletStep(input);
    return enumerations;
  });
}
