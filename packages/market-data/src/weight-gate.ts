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

  async function waitIfNeeded(): Promise<void> {
    if (lastUsedWeight < threshold) return;
    // A Binance zera o peso a cada minuto cheio do relógio.
    const remainingInWindow =
      WEIGHT_WINDOW_MILLISECONDS - (params.now() % WEIGHT_WINDOW_MILLISECONDS);
    lastUsedWeight = 0;
    await params.sleep(remainingInWindow);
  }

  function record(response: Response): void {
    const header = response.headers.get(USED_WEIGHT_HEADER);
    if (header === null) return;
    const used = Number(header);
    if (Number.isFinite(used)) lastUsedWeight = used;
  }

  return { waitIfNeeded, record };
}
