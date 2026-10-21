// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import {
  decimalTextSchema,
  epochMillisecondsSchema,
  isoDateTimeSchema,
  resourceIdSchema,
} from '../openapi/schema-primitives.js';
import { VALIDATION_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import { cursorTextSchema } from '../shared/pagination/page-query.schema.js';
import {
  NOTICE_KIND,
  NOTICE_PAGE_SIZE,
  NOTICE_SCOPE_QUERY,
  NOTICE_STATE,
} from './notice.constant.js';

const LIMIT_PATTERN = /^\d{1,3}$/;

export const noticesQuerySchema = z.strictObject({
  limit: z
    .string()
    .regex(LIMIT_PATTERN)
    .transform(Number)
    .pipe(z.number().int().min(1).max(NOTICE_PAGE_SIZE.MAXIMUM))
    .optional(),
  cursor: cursorTextSchema.optional(),
  after: cursorTextSchema.optional(),
  scope: z.enum(NOTICE_SCOPE_QUERY).optional(),
});

const MANUAL_SCHEMA = z.strictObject({
  orderType: z.string().nullable(),
  decidedAt: isoDateTimeSchema.nullable(),
  referencePrice: decimalTextSchema,
  quantity: decimalTextSchema.nullable(),
  runBalance: decimalTextSchema.nullable(),
  notional: decimalTextSchema.nullable(),
  targetPrice: decimalTextSchema,
  stopPrice: decimalTextSchema,
  tickSize: decimalTextSchema.nullable(),
  quantityStep: decimalTextSchema.nullable(),
  costRate: decimalTextSchema.nullable(),
  netGainRate: decimalTextSchema.nullable(),
  netLossRate: decimalTextSchema.nullable(),
  netRatio: decimalTextSchema.nullable(),
  breakEvenEntry: decimalTextSchema.nullable(),
  history: z.strictObject({ days: z.number().int(), netReturnRate: decimalTextSchema }).nullable(),
  how: z.string().nullable(),
  quantityText: z.string().nullable(),
  costText: z.string().nullable(),
  netText: z.string().nullable(),
  giveUpText: z.string().nullable(),
  historyText: z.string(),
  honesty: z.string(),
});

export const NOTICE_VIEW_SCHEMA = z.strictObject({
  noticeId: z.string(),
  runId: resourceIdSchema.nullable(),
  symbol: z.string(),
  timeframe: z.string().nullable(),
  kind: z.enum(NOTICE_KIND),
  state: z.enum(NOTICE_STATE),
  occurredAt: isoDateTimeSchema,
  candleTime: epochMillisecondsSchema.nullable(),
  confirmsAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema.nullable(),
  operationKey: z.string().nullable(),
  price: decimalTextSchema.nullable(),
  limitPrice: decimalTextSchema.nullable(),
  fee: decimalTextSchema.nullable(),
  resultRate: decimalTextSchema.nullable(),
  targetPrice: decimalTextSchema.nullable(),
  entryPrice: decimalTextSchema.nullable(),
  stopPrice: decimalTextSchema.nullable(),
  reasonCode: z.string(),
  title: z.string(),
  message: z.string(),
  detail: z.string().nullable(),
  manual: MANUAL_SCHEMA.nullable(),
});

export const NOTICES_DOCUMENTATION: RouteDocumentation = {
  summary:
    'Avisos da simulação ao vivo e dos alertas de preço do usuário, do mais novo para o mais antigo (padrão 30, máximo ' +
    '50): ordem pedida, executada, cancelada ou recusada (UM aviso por ordem, que muda de estado), saídas com motivo, ' +
    'simulação parada ou de volta, espera por dados, meta e alerta de preço disparado. As frases saem de um catálogo ' +
    'fechado do servidor, sem data nem hora (a marca `{abre}`, `{fecha}`, `{validade}` ou `{hora}` é trocada pelo painel ' +
    'no fuso do usuário). `cursor` pagina para os avisos anteriores; `after` devolve só os avisos MAIS NOVOS que o ' +
    'cursor (o resumo ao voltar); `scope` recorta as simulações (`runs`), os alertas de preço (`price-alerts`) ou tudo ' +
    '(`all`). Na compra executada e na venda vem o bloco `manual` ("Operar à mão": como a simulação executou, quantidade, ' +
    'custo e líquido, ponto de equilíbrio, histórico). Só leitura, só do dono, dos últimos 30 dias; é simulação com dinheiro fictício, não recomendação.',
  tag: 'Avisos',
  query: noticesQuerySchema,
  successes: [
    {
      status: HTTP_STATUS.OK,
      description: 'Uma página de avisos, do mais novo para o mais antigo.',
      schema: z.array(NOTICE_VIEW_SCHEMA),
      isList: true,
    },
  ],
  errors: [
    { status: HTTP_STATUS.BAD_REQUEST, code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED },
  ],
};
