// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState } from 'react';

import { USDT_RATE_STORAGE_KEY } from './asset.constant.js';
import { parseRate } from './asset-math.js';

export type UsdtRate = {
  readonly text: string;
  readonly rate: bigint | undefined;
  readonly setText: (text: string) => void;
};

function readStored(): string {
  try {
    return window.localStorage.getItem(USDT_RATE_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeStored(text: string): void {
  try {
    window.localStorage.setItem(USDT_RATE_STORAGE_KEY, text);
  } catch {
    // Sem armazenamento (janela privada): a cotação vale só nesta tela.
  }
}

// O produto não tem fonte de câmbio: a cotação USDT→R$ é a que o usuário digita, guardada só neste navegador.
export function useUsdtRate(): UsdtRate {
  const [text, setTextState] = useState(readStored);
  return {
    text,
    rate: parseRate(text),
    setText: (next): void => {
      setTextState(next);
      writeStored(next);
    },
  };
}
