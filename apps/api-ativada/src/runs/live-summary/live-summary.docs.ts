// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import type { RouteDocumentation } from '../../openapi/route-documentation.types.js';
import { VALIDATION_ERROR_CODE } from '../../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../../shared/http/http.constant.js';
import { LIVE_SUMMARY_SCHEMA } from './live-summary.schema.js';

export const liveSummaryQuerySchema = z.strictObject({});

export const RUN_LIVE_SUMMARY_DOCUMENTATION: RouteDocumentation = {
  summary:
    'Resumo de TODAS as simulações ao vivo ativas (na fila ou rodando) do dono, da mais recente para a mais antiga, numa ' +
    'consulta só (sem uma leitura por simulação): estratégia, se tem analista (sombra ou governa), saldo e resultado ' +
    'desde o início (decimal exato, arredondado contra o usuário), comparação com "comprar e segurar", número de compras ' +
    'e vendas, o fechamento da vela da última decisão e se espera candles que faltam. Cada simulação tem o próprio saldo ' +
    'fictício: somar os saldos não é uma carteira real.',
  tag: 'Execuções — acompanhamento',
  query: liveSummaryQuerySchema,
  successes: [
    {
      status: HTTP_STATUS.OK,
      description: 'O resumo de cada simulação ao vivo ativa.',
      schema: LIVE_SUMMARY_SCHEMA,
    },
  ],
  errors: [
    { status: HTTP_STATUS.BAD_REQUEST, code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED },
  ],
};
