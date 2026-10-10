// Copyright (c) 2026 Ada Technology. All rights reserved.
const POLL_INTERVAL_MILLISECONDS = 5;
const DEFAULT_TIMEOUT_MILLISECONDS = 3_000;

export async function waitFor(
  condition: () => boolean,
  description: string,
  timeoutMilliseconds: number = DEFAULT_TIMEOUT_MILLISECONDS,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Tempo esgotado esperando: ${description}`);
    await Bun.sleep(POLL_INTERVAL_MILLISECONDS);
  }
}

export type RecordingSleep = {
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly delays: number[];
};

// Registra o atraso pedido e devolve quase na hora: o teste mede o pedido, não o relógio.
export function createRecordingSleep(): RecordingSleep {
  const delays: number[] = [];
  return {
    delays,
    sleep: (milliseconds): Promise<void> => {
      delays.push(milliseconds);
      return Bun.sleep(1);
    },
  };
}

export type ManualClock = {
  readonly now: () => number;
  readonly advance: (milliseconds: number) => void;
};

export function createManualClock(startMilliseconds: number): ManualClock {
  let current = startMilliseconds;
  return {
    now: (): number => current,
    advance: (milliseconds): void => {
      current += milliseconds;
    },
  };
}
