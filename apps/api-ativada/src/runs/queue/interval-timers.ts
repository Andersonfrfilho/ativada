// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IntervalTimers } from './run-queue-dispatcher.types.js';

// Os temporizadores de verdade: o batimento e a ronda da fila. A tarefa trata os próprios erros; um ciclo que ainda
// roda faz as batidas seguintes serem puladas, para a mesma tarefa nunca correr em duas frentes.
export function createIntervalTimers(): IntervalTimers {
  return {
    every: (milliseconds, task) => {
      let isRunning = false;
      const runOnce = async (): Promise<void> => {
        if (isRunning) return;
        isRunning = true;
        try {
          await task();
        } finally {
          isRunning = false;
        }
      };
      const handle = setInterval(() => void runOnce(), milliseconds);
      return () => clearInterval(handle);
    },
  };
}
