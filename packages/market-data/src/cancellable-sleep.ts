// Copyright (c) 2026 Ada Technology. All rights reserved.

export type CancellableSleep = {
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly cancelAll: () => void;
};

// Quem cancela não espera a promessa: ela fica pendente e o dono a descarta (Promise.race com o encerramento).
export function createCancellableSleep(): CancellableSleep {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  return {
    sleep: (milliseconds): Promise<void> =>
      new Promise((resolve) => {
        const timer = setTimeout(() => {
          timers.delete(timer);
          resolve();
        }, milliseconds);
        timers.add(timer);
      }),
    cancelAll: (): void => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    },
  };
}
