// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import { resourceIdSchema } from '../openapi/schema-primitives.js';
import {
  GOAL_ERROR_CODE,
  STRATEGY_ERROR_CODE,
  VALIDATION_ERROR_CODE,
} from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import { HORIZONS_VIEW_SCHEMA } from './horizon-view.schema.js';

export const HORIZON_DOCUMENTATION = {
  evaluation: {
    summary:
      'Compara os prazos de UMA moeda: a operação de 15 em 15 minutos nos últimos 90 dias e segurar a estratégia por 7, 15 e 30 dias (mediana, % de janelas positivas e pior 10%, e comprar e segurar nas mesmas janelas), cada linha com uma frase pronta em português e no máximo uma com o selo de recomendada. Sem strategyId vale a melhor das 5 estratégias mais novas do usuário em cada linha. O que está em cache responde na hora; o que falta é calculado numa thread à parte e gasta o orçamento de 3 avaliações a frio por minuto (429 RATE_LIMITED com Retry-After); com muitas avaliações em andamento a resposta é 503 com Retry-After.',
    tag: 'Prazos',
    query: z.strictObject({ symbol: z.string(), strategyId: resourceIdSchema.optional() }),
    successes: [
      {
        status: HTTP_STATUS.OK,
        description:
          'As linhas e a recomendação. É o histórico, não promessa: "em geral +0,4%" é a mediana das janelas passadas.',
        schema: HORIZONS_VIEW_SCHEMA,
      },
    ],
    errors: [
      {
        status: HTTP_STATUS.BAD_REQUEST,
        code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED,
      },
      { status: HTTP_STATUS.NOT_FOUND, code: STRATEGY_ERROR_CODE.STRATEGY_NOT_FOUND },
      { status: HTTP_STATUS.SERVICE_UNAVAILABLE, code: GOAL_ERROR_CODE.GOAL_EVALUATION_BUSY },
      { status: HTTP_STATUS.SERVICE_UNAVAILABLE, code: GOAL_ERROR_CODE.GOAL_EVALUATION_TIMEOUT },
    ],
  },
} as const satisfies Readonly<Record<string, RouteDocumentation>>;
