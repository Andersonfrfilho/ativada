// Copyright (c) 2026 Ada Technology. All rights reserved.
import { computeDatasetMetrics } from '../test/fixtures/strategy-engine/metrics/metrics-golden.fixture.js';
import { GOLDEN_DATASETS } from '../test/fixtures/strategy-engine/production/engine-golden.fixture.js';

// Exporta pontos e operações de um conjunto real, na forma que o oráculo Python lê (stdout).
const name = Bun.argv[2];
const dataset = GOLDEN_DATASETS.find((candidate) => candidate.name === name);
if (dataset === undefined) {
  throw new Error(
    `Conjunto desconhecido: ${name ?? '(nenhum)'}. Use: ${GOLDEN_DATASETS.map((item) => item.name).join(' | ')}`,
  );
}
console.log(JSON.stringify(computeDatasetMetrics(dataset)));
