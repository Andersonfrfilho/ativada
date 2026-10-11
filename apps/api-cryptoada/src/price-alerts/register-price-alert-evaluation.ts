// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createPriceAlertEvaluationRepository, type DatabaseHandle } from '@cryptoada/database';
import { MILLISECONDS_PER_SECOND } from '@cryptoada/environment';

import type { Environment } from '../environment.js';
import type { ApplicationStream } from '../stream/create-application-stream.js';
import { createPriceAlertEvaluator } from './price-alert-evaluator.js';

export type RegisterPriceAlertEvaluationParams = {
  readonly environment: Pick<Environment, 'TICKER_STALE_SECONDS'>;
  readonly database: DatabaseHandle;
  readonly stream: Pick<ApplicationStream, 'addPriceTickListener'>;
};

// O alerta de preço (T4b.7) assina o tick agregado da API, que já tem o ticker público; sem ticker, nada é avaliado.
export function registerPriceAlertEvaluation(params: RegisterPriceAlertEvaluationParams): void {
  params.stream.addPriceTickListener(
    createPriceAlertEvaluator({
      repository: createPriceAlertEvaluationRepository(params.database),
      now: () => Date.now(),
      staleAfterMilliseconds: params.environment.TICKER_STALE_SECONDS * MILLISECONDS_PER_SECOND,
    }),
  );
}
