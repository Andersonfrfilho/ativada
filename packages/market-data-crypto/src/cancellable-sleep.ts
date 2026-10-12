// Copyright (c) 2026 Ada Technology. All rights reserved.
export type CancellableSleep = {
  readonly sleep: (milliseconds: number) => Promise<void>;
  // Acorda as esperas pendentes (não as deixa penduradas): quem dormia checa a parada e sai.
  readonly cancelAll: () => void;
};

export function createCancellableSleep(): CancellableSleep {
  const pending = new Map<ReturnType<typeof setTimeout>, () => void>();
  return {
    sleep: (milliseconds): Promise<void> =>
      new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(timer);
          resolve();
        }, milliseconds);
        pending.set(timer, resolve);
      }),
    cancelAll: (): void => {
      for (const [timer, wake] of pending) {
        clearTimeout(timer);
        wake();
      }
      pending.clear();
    },
  };
}
