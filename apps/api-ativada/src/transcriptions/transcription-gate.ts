// Copyright (c) 2026 Ada Technology. All rights reserved.
import { TranscriptionBusyError } from './transcription.error.js';

export type TranscriptionGate = {
  readonly run: <TResult>(task: () => Promise<TResult>) => Promise<TResult>;
};

// Uma transcrição por vez; até `maxWaiting` esperam a vez em ordem, e a seguinte recebe 503 na hora.
export function createTranscriptionGate(maxWaiting: number): TranscriptionGate {
  let isRunning = false;
  const waiting: (() => void)[] = [];

  async function acquire(): Promise<void> {
    if (!isRunning) {
      isRunning = true;
      return;
    }
    if (waiting.length >= maxWaiting) throw new TranscriptionBusyError();
    await new Promise<void>((resolve) => waiting.push(resolve));
  }

  // A vaga passa direto para quem espera: ninguém de fora fura a fila entre a saída e a entrada.
  function release(): void {
    const next = waiting.shift();
    if (next === undefined) {
      isRunning = false;
      return;
    }
    next();
  }

  return {
    run: async <TResult>(task: () => Promise<TResult>): Promise<TResult> => {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}
