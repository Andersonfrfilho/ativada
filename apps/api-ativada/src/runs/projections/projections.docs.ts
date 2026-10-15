// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RouteDocumentation } from '../../openapi/route-documentation.types.js';
import { pathIdSchema } from '../../openapi/schema-primitives.js';
import { RUN_ERROR_CODE, VALIDATION_ERROR_CODE } from '../../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../../shared/http/http.constant.js';
import { RUN_ID_PARAM } from '../runs.constant.js';
import { PROJECTIONS_SCHEMA, projectionsQuerySchema } from './projections.schema.js';

export const PROJECTIONS_DOCUMENTATION: RouteDocumentation = {
  summary:
    'Tendência do placar e histórico de acertos (regra `projection-1`). `current` é a tendência da última vela decidida da ' +
    'simulação ao vivo rodando (lado, força, postura, faixa de ±1 ATR e a frase pronta) ou o motivo de não haver ' +
    '(`not_running`, `no_candle`, `warming_up`, `neutral`). A previsão é a TENDÊNCIA do placar, nunca um preço-alvo. ' +
    '`summary` conta a execução inteira (no walk-forward, só as janelas de teste que terminaram bem): acerto do lado, ' +
    '"sempre sobe", dentro da faixa, acerto por força, intervalo de Wilson de 95% e o veredito contra a moeda ao ar, com ' +
    'as frases prontas. `items` traz as previsões da mais recente para a mais antiga, por cursor (padrão 24, máximo 100), ' +
    'cada uma com o resultado na vela seguinte. Nada é recalculado pelo motor: tudo vem de `signals` e `candles`. ' +
    'Qualquer tipo de execução responde.',
  tag: 'Execuções — acompanhamento',
  params: pathIdSchema(RUN_ID_PARAM),
  query: projectionsQuerySchema,
  successes: [
    {
      status: HTTP_STATUS.OK,
      description: 'A tendência atual, o resumo de acertos e a página de previsões.',
      schema: PROJECTIONS_SCHEMA,
    },
  ],
  errors: [
    { status: HTTP_STATUS.BAD_REQUEST, code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED },
    { status: HTTP_STATUS.NOT_FOUND, code: RUN_ERROR_CODE.RUN_NOT_FOUND },
  ],
};
