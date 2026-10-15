// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RouteDocumentation } from '../../openapi/route-documentation.types.js';
import { pathIdSchema } from '../../openapi/schema-primitives.js';
import { RUN_ERROR_CODE, VALIDATION_ERROR_CODE } from '../../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../../shared/http/http.constant.js';
import { RUN_ID_PARAM } from '../runs.constant.js';
import { STRATEGY_LAYERS_SCHEMA, strategyLayersQuerySchema } from './strategy-layers.schema.js';

export const STRATEGY_LAYERS_DOCUMENTATION: RouteDocumentation = {
  summary:
    'Camadas da estratégia para o gráfico de velas, em colunas alinhadas a `candleTimes` (as velas decididas da faixa, ' +
    'crescentes): `score` e `actions` por vela, o `atr` gravado e uma linha por saída das regras de PREÇO da versão ' +
    '(canal Donchian, médias do cruzamento de EMA e bandas de Bollinger; as demais regras não desenham linha sobre o ' +
    'preço e uma estratégia sem regra de preço devolve `lines: []`), cada uma com `role`, o `label` pronto e `values` ' +
    '(texto decimal, ou `null` quando a leitura não existe naquela vela). `thresholds` traz os limiares de compra e ' +
    'venda de cada trecho da faixa (no walk-forward, um por janela de teste; a janela parada fica de fora). A faixa ' +
    '`[from, to)` (ms UTC) é recortada à da execução; sem `to` vai ao fim dela e sem `from` volta 1.000 velas. Mais de ' +
    '1.000 velas é `400` com `to: range_too_large`. Nada é recalculado: tudo vem do que o motor gravou em `signals`. ' +
    'Execução na fila responde com listas vazias.',
  tag: 'Execuções — séries',
  params: pathIdSchema(RUN_ID_PARAM),
  query: strategyLayersQuerySchema,
  successes: [
    {
      status: HTTP_STATUS.OK,
      description: 'As camadas da estratégia na faixa pedida.',
      schema: STRATEGY_LAYERS_SCHEMA,
    },
  ],
  errors: [
    { status: HTTP_STATUS.BAD_REQUEST, code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED },
    { status: HTTP_STATUS.NOT_FOUND, code: RUN_ERROR_CODE.RUN_NOT_FOUND },
  ],
};
