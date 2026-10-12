// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Engine, RunSetup } from '@ativada/strategy-engine';

import type { CandleSeries } from './candle-series.js';
import type { WalkForwardContext } from './load-walk-forward-context.js';
import type { PhaseTimer } from './phase-timer.js';
import type { WalkForwardRunSession } from './walk-forward-database.types.js';
import type { WalkForwardProgress } from './walk-forward-progress.js';
import type { WindowSpans } from './window-spans.js';

// O que as fases do walk-forward compartilham, montado uma vez por execução.
export type WalkForwardDeps = {
  readonly session: WalkForwardRunSession;
  readonly context: WalkForwardContext;
  readonly setup: RunSetup;
  readonly engine: Engine;
  readonly series: CandleSeries;
  readonly spans: readonly WindowSpans[];
  readonly progress: WalkForwardProgress;
  readonly timer: PhaseTimer;
  readonly report: (percent: number) => void;
};
