// Copyright (c) 2026 Ada Technology. All rights reserved.
import { USED_WEIGHT_HEADER, WEIGHT_WINDOW_MILLISECONDS } from './market-data.constant.js';

export type WeightGateParams = {
  readonly ceiling: number;
  readonly safetyMargin: number;
  readonly now: () => number;
  readonly sleep: (milliseconds: number) => Promise<void>;
};

export type WeightGate = {
  readonly waitIfNeeded: () => Promise<void>;
  readonly record: (response: Response) => void;
};

export function createWeightGate(params: WeightGateParams): WeightGate {
  const threshold = params.ceiling - params.safetyMargin;
  let lastUsedWeight = 0;
  let lastWeightWindow: number | undefined;

  function currentWindow(): number {
    return Math.floor(params.now() / WEIGHT_WINDOW_MILLISECONDS);
  }

  async function waitIfNeeded(): Promise<void> {
    // O peso lido numa janela anterior já zerou na Binance: não bloqueia a janela atual.
    if (lastWeightWindow !== currentWindow()) return;
    if (lastUsedWeight < threshold) return;
    const remainingInWindow =
      WEIGHT_WINDOW_MILLISECONDS - (params.now() % WEIGHT_WINDOW_MILLISECONDS);
    lastUsedWeight = 0;
    await params.sleep(remainingInWindow);
  }

  function record(response: Response): void {
    const header = response.headers.get(USED_WEIGHT_HEADER);
    if (header === null) return;
    const used = Number(header);
    if (!Number.isFinite(used)) return;
    lastUsedWeight = used;
    lastWeightWindow = currentWindow();
  }

  return { waitIfNeeded, record };
}
