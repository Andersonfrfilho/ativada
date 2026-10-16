// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { InMemoryLive, LiveScenario } from './in-memory-live-database.fixture.js';
import {
  ANALYST_REAL_DATASET,
  ANALYST_REAL_SENTIMENT,
  ANALYST_SHADOW_REQUEST,
} from './analyst-real-data.fixture.js';
import { buildLive } from './live-scenarios.fixture.js';

export { ANALYST_REAL_DATASET, ANALYST_REAL_SENTIMENT, ANALYST_SHADOW_REQUEST };

export type AnalystLiveBuild = {
  readonly withAnalyst: boolean;
  // Quantas das velas do recorte a simulação vê (o resto não existe): encurta o teste.
  readonly candleCount?: number;
  readonly overrides?: Partial<Omit<LiveScenario, 'candles'>>;
};

export function buildAnalystLive(build: AnalystLiveBuild): InMemoryLive {
  const candles =
    build.candleCount === undefined
      ? ANALYST_REAL_DATASET.candles
      : ANALYST_REAL_DATASET.candles.slice(0, build.candleCount);
  return buildLive({
    dataset: ANALYST_REAL_DATASET,
    candles,
    overrides: {
      sentiment: ANALYST_REAL_SENTIMENT,
      ...(build.withAnalyst ? { analyst: ANALYST_SHADOW_REQUEST } : {}),
      ...build.overrides,
    },
  });
}
