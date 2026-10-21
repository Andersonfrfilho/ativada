// Copyright (c) 2026 Ada Technology. All rights reserved.
import { normalizeBalanceInput } from './manual-trade.js';

export const MY_BALANCE_KEY = 'ativada.notices.my-balance';

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

// "Meu saldo" (D12-A): fica SÓ neste navegador, nunca vai à API; texto inválido ou armazenamento negado viram "sem saldo".
export function readMyBalance(storage = defaultStorage()): string | undefined {
  try {
    const stored = storage?.getItem(MY_BALANCE_KEY) ?? '';
    return normalizeBalanceInput(stored);
  } catch {
    return undefined;
  }
}

export function writeMyBalance(text: string, storage = defaultStorage()): void {
  try {
    const valid = normalizeBalanceInput(text);
    if (valid === undefined) storage?.removeItem(MY_BALANCE_KEY);
    else storage?.setItem(MY_BALANCE_KEY, valid);
  } catch {
    return;
  }
}
