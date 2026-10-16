// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_STATUS } from '@ativada/database';
import { z } from '@ativada/environment';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import { pathIdSchema, resourceIdSchema } from '../openapi/schema-primitives.js';
import {
  GOAL_ERROR_CODE,
  RUN_ERROR_CODE,
  STRATEGY_ERROR_CODE,
  VALIDATION_ERROR_CODE,
} from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import { CSV_TABLE_NAMES } from './csv-tables.constant.js';
import { RUN_DETAIL_SCHEMA, RUN_VIEW_SCHEMA } from './run-view.schema.js';
import { RUN_ID_PARAM } from './runs.constant.js';

const TAG = 'Execuções';
const RUN_PARAMS = pathIdSchema(RUN_ID_PARAM);
const VALIDATION = {
  status: HTTP_STATUS.BAD_REQUEST,
  code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED,
} as const;
const RUN_NOT_FOUND = {
  status: HTTP_STATUS.NOT_FOUND,
  code: RUN_ERROR_CODE.RUN_NOT_FOUND,
} as const;

export const RUN_DOCUMENTATION = {
  create: {
    summary:
      'Cria uma execução (backtest, walk-forward ou simulação ao vivo) e responde 202 com o id. Backtest e walk-forward entram na fila do usuário, que é limitada (429 `RUN_QUEUE_FULL`). `live_paper` não leva período (começa no candle corrente e não tem fim), fica `queued` até um worker reivindicá-la e responde 409 `LIVE_RUN_LIMIT_REACHED` acima do teto de ativas. `survival` (opcional, só no ao vivo) ajusta o piso (padrão 0,8 do saldo inicial) e a meta de dobro (padrão 2). `goalId` (opcional, só no ao vivo) atrela a simulação a uma meta ligada do usuário, do mesmo par: ela vende no alvo, encerra na perda máxima ou no prazo e grava o desfecho em `goalOutcome`. `analyst` (opcional, só no ao vivo e só com `timeframe` 15m) liga o analista de risco: `{ "mode": "shadow" }` calcula a postura, o ritmo e o tamanho a cada vela e só mostra, sem mexer na simulação; `govern` ainda não existe e responde 400.',
    tag: TAG,
    successes: [
      {
        status: HTTP_STATUS.ACCEPTED,
        description:
          'Execução aceita (`queued`). Se não pôde ser entregue ao executor, volta `failed` com `DISPATCH_FAILED`.',
        schema: RUN_DETAIL_SCHEMA,
      },
    ],
    errors: [
      VALIDATION,
      { status: HTTP_STATUS.BAD_REQUEST, code: RUN_ERROR_CODE.GRID_TOO_LARGE },
      { status: HTTP_STATUS.BAD_REQUEST, code: RUN_ERROR_CODE.NO_VALID_COMBINATIONS },
      { status: HTTP_STATUS.BAD_REQUEST, code: RUN_ERROR_CODE.INVALID_GRID },
      { status: HTTP_STATUS.BAD_REQUEST, code: RUN_ERROR_CODE.INVALID_WINDOW_CONFIG },
      { status: HTTP_STATUS.BAD_REQUEST, code: RUN_ERROR_CODE.PERIOD_TOO_SHORT },
      { status: HTTP_STATUS.NOT_FOUND, code: STRATEGY_ERROR_CODE.STRATEGY_VERSION_NOT_FOUND },
      { status: HTTP_STATUS.NOT_FOUND, code: GOAL_ERROR_CODE.GOAL_NOT_FOUND },
      { status: HTTP_STATUS.CONFLICT, code: GOAL_ERROR_CODE.GOAL_INACTIVE },
      { status: HTTP_STATUS.CONFLICT, code: RUN_ERROR_CODE.LIVE_RUN_LIMIT_REACHED },
      { status: HTTP_STATUS.TOO_MANY_REQUESTS, code: RUN_ERROR_CODE.RUN_QUEUE_FULL },
    ],
  },
  list: {
    summary:
      'Lista as execuções do usuário, das mais novas para as mais antigas. Filtros opcionais e combináveis: `kind`, `symbol` (par habilitado) e `strategyVersionId`; valem antes da paginação por cursor.',
    tag: TAG,
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'Uma página de execuções.',
        schema: z.array(RUN_VIEW_SCHEMA),
        isList: true,
      },
    ],
    errors: [VALIDATION],
  },
  get: {
    summary:
      'Status, progresso, métricas, alerta de overfitting, avisos, a posição na fila (a do usuário e a global, só como número) e, na simulação ao vivo, a sobrevivência do saldo (RF09): o piso e a meta de dobro, o tempo até cada um quando atingido e o progresso enquanto não.',
    tag: TAG,
    params: RUN_PARAMS,
    successes: [{ status: HTTP_STATUS.OK, description: 'A execução.', schema: RUN_DETAIL_SCHEMA }],
    errors: [RUN_NOT_FOUND],
  },
  stop: {
    summary:
      'Cancela uma execução `queued` ou `running`, inclusive a simulação ao vivo (idempotente); o worker a vê no passo seguinte e para.',
    tag: TAG,
    params: RUN_PARAMS,
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'A execução ficou (ou já estava) cancelada.',
        schema: z.strictObject({ id: resourceIdSchema, status: z.literal(RUN_STATUS.CANCELLED) }),
      },
    ],
    errors: [
      RUN_NOT_FOUND,
      { status: HTTP_STATUS.CONFLICT, code: RUN_ERROR_CODE.RUN_ALREADY_FINISHED },
    ],
  },
  delete: {
    summary:
      'Apaga (exclusão lógica) uma execução terminada: ela some da lista, do detalhe, das séries e da exportação e libera a cota de execuções guardadas. A que ainda está na fila ou rodando pede `stop` antes.',
    tag: TAG,
    params: RUN_PARAMS,
    successes: [{ status: HTTP_STATUS.NO_CONTENT, description: 'Apagada.' }],
    errors: [
      RUN_NOT_FOUND,
      { status: HTTP_STATUS.CONFLICT, code: RUN_ERROR_CODE.RUN_NOT_FINISHED },
    ],
  },
  exportCsv: {
    summary:
      'Exporta uma tabela do registro da execução em CSV (UTF-8, em fluxo por páginas, com proteção contra injeção de fórmula).',
    tag: TAG,
    params: RUN_PARAMS,
    query: z.strictObject({ table: z.enum(CSV_TABLE_NAMES).optional() }),
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'O arquivo CSV (`Content-Disposition: attachment`).',
        contentType: 'text/csv; charset=utf-8',
        schema: z.string(),
      },
    ],
    errors: [VALIDATION, RUN_NOT_FOUND],
  },
  exportLogCsv: {
    summary:
      'Exporta o registro cronológico da execução em CSV: sinais (com o motivo), ordens e preenchimentos juntos, do mais antigo ao mais novo (UTF-8, em fluxo por páginas, tempos em UTC ISO, decimais exatos, com proteção contra injeção de fórmula).',
    tag: TAG,
    params: RUN_PARAMS,
    query: z.strictObject({}),
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'O arquivo CSV (`Content-Disposition: attachment`).',
        contentType: 'text/csv; charset=utf-8',
        schema: z.string(),
      },
    ],
    errors: [VALIDATION, RUN_NOT_FOUND],
  },
} as const satisfies Readonly<Record<string, RouteDocumentation>>;
