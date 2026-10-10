// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  HEALTH_BUDGET_MILLISECONDS,
  HEALTH_PATH,
  HEALTH_SAMPLE_PAUSE_MILLISECONDS,
} from './api-runs-test.constant.js';
import { assertCondition, reportLine, type ApiRunsContext } from './api-runs-test-context.js';

export type HealthProbe = {
  readonly stop: () => Promise<void>;
};

// Mede `GET /v1/health` enquanto a execução roda: a thread de trabalho nunca pode travar o laço de eventos da API.
export function startHealthProbe(context: ApiRunsContext, label: string): HealthProbe {
  const latencies: number[] = [];
  let isRunning = true;
  const loop = (async (): Promise<void> => {
    while (isRunning) {
      const startedAt = performance.now();
      const response = await fetch(`${context.api.baseUrl}${HEALTH_PATH}`);
      assertCondition(
        response.status === 200,
        `a saúde respondeu ${response.status} durante ${label}`,
      );
      latencies.push(performance.now() - startedAt);
      await Bun.sleep(HEALTH_SAMPLE_PAUSE_MILLISECONDS);
    }
  })();
  return {
    stop: async (): Promise<void> => {
      isRunning = false;
      await loop;
      const slowest = Math.max(...latencies);
      assertCondition(
        latencies.length >= 3,
        `só ${latencies.length} amostras de saúde durante ${label}`,
      );
      assertCondition(
        slowest < HEALTH_BUDGET_MILLISECONDS,
        `GET ${HEALTH_PATH} levou ${slowest.toFixed(1)} ms durante ${label}`,
      );
      const mean = latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
      reportLine(
        `NÃO BLOQUEIA: GET ${HEALTH_PATH} durante ${label}: ${latencies.length} amostras, média ${mean.toFixed(2)} ms, máxima ${slowest.toFixed(2)} ms (< ${HEALTH_BUDGET_MILLISECONDS} ms)`,
      );
    },
  };
}
