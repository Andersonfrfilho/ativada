// Copyright (c) 2026 Ada Technology. All rights reserved.

export const CALM_STORAGE_KEY = 'ativada.team-room.calm';

const listeners = new Set<() => void>();

function storage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

// Preferência de tela (nada da simulação). Armazenamento indisponível ou valor estranho = ritmo normal.
export function readCalm(): boolean {
  try {
    return storage()?.getItem(CALM_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeCalm(isCalm: boolean): void {
  try {
    storage()?.setItem(CALM_STORAGE_KEY, String(isCalm));
  } catch {
    // Sem armazenamento a escolha vale só nesta tela.
  }
  listeners.forEach((listener) => listener());
}

// A varanda e o escritório leem a mesma escolha: o botão de um muda o ritmo do outro.
export function subscribeCalm(listener: () => void): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}
