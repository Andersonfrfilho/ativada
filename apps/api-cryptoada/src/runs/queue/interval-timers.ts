// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IntervalTimers } from './run-queue-dispatcher.types.js';

// Os temporizadores de verdade: o batimento e a ronda da fila. A tarefa trata os próprios erros.
export function createIntervalTimers(): IntervalTimers {
  return {
    every: (milliseconds, task) => {
      const handle = setInterval(() => void task(), milliseconds);
      return () => clearInterval(handle);
    },
  };
}
