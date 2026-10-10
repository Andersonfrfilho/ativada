// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  buildMetricsGolden,
  GOLDEN_METRICS_PATH,
} from '../test/fixtures/strategy-engine/metrics/metrics-golden.fixture.js';

// Regrava o dourado das métricas (ADR 0002 §"Métricas"): rode só ao mudar METRICS_VERSION ou ENGINE_VERSION.
await Bun.write(GOLDEN_METRICS_PATH, `${JSON.stringify(buildMetricsGolden(), null, 2)}\n`);
console.log(`Dourado gravado em ${GOLDEN_METRICS_PATH}`);
