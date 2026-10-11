// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import {
  decimalTextSchema,
  epochMillisecondsSchema,
  isoDateTimeSchema,
  resourceIdSchema,
} from '../openapi/schema-primitives.js';
import {
  STRATEGY_ERROR_CODE,
  USER_ASSET_ERROR_CODE,
  VALIDATION_ERROR_CODE,
} from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import { PAGE_QUERY_SHAPE } from '../shared/pagination/page-query.schema.js';
import { ASSET_SYMBOL_PARAM } from './asset.constant.js';

const TAG = 'Seus ativos';
const NULLABLE_DECIMAL = decimalTextSchema.nullable();

export const ASSET_VIEW_SCHEMA = z.strictObject({
  id: resourceIdSchema,
  symbol: z.string(),
  quantity: decimalTextSchema,
  averagePrice: decimalTextSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

const RULE_SCHEMA = z.strictObject({
  action: z.enum(['hold', 'sell', 'wait']),
  situation: z.strictObject({
    signal: z.strictObject({
      action: z.string(),
      score: decimalTextSchema,
      regime: z.string(),
      reason: z.string(),
    }),
    triggers: z.looseObject({
      version: z.string(),
      state: z.string(),
      rules: z.array(z.looseObject({})),
    }),
  }),
});

const ITEM_SCHEMA = z.strictObject({
  symbol: z.string(),
  quantity: decimalTextSchema,
  averagePrice: decimalTextSchema,
  price: z
    .strictObject({ value: decimalTextSchema, at: epochMillisecondsSchema, source: z.string() })
    .nullable(),
  value: NULLABLE_DECIMAL,
  cost: decimalTextSchema,
  result: NULLABLE_DECIMAL,
  resultRate: NULLABLE_DECIMAL,
  targetPrice: decimalTextSchema,
  stopPrice: decimalTextSchema,
  isTargetReached: z.boolean().nullable(),
  isStopReached: z.boolean().nullable(),
  rule: RULE_SCHEMA.nullable(),
});

export const ASSET_SUMMARY_SCHEMA = z.strictObject({
  currency: z.string(),
  targetRate: decimalTextSchema,
  stopRate: decimalTextSchema,
  strategy: z
    .strictObject({
      id: resourceIdSchema,
      name: z.string(),
      versionId: resourceIdSchema,
      version: z.number().int().positive(),
    })
    .nullable(),
  items: z.array(ITEM_SCHEMA),
  totals: z.strictObject({
    value: decimalTextSchema,
    cost: decimalTextSchema,
    result: decimalTextSchema,
    resultRate: NULLABLE_DECIMAL,
    pricedAssets: z.number().int().nonnegative(),
    unpricedAssets: z.number().int().nonnegative(),
  }),
});

const PARAMS = z.strictObject({ [ASSET_SYMBOL_PARAM]: z.string() });
const VALIDATION = {
  status: HTTP_STATUS.BAD_REQUEST,
  code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED,
} as const;
const NOT_FOUND = {
  status: HTTP_STATUS.NOT_FOUND,
  code: USER_ASSET_ERROR_CODE.ASSET_NOT_FOUND,
} as const;
const LIMIT = {
  status: HTTP_STATUS.CONFLICT,
  code: USER_ASSET_ERROR_CODE.ASSET_LIMIT_REACHED,
} as const;
const ASSET_OK = [{ status: HTTP_STATUS.OK, description: 'O ativo.', schema: ASSET_VIEW_SCHEMA }];

export const ASSET_DOCUMENTATION = {
  list: {
    summary: 'Lista os ativos do usuário, em ordem alfabética do par.',
    tag: TAG,
    query: z.strictObject(PAGE_QUERY_SHAPE),
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'Uma página de ativos.',
        schema: z.array(ASSET_VIEW_SCHEMA),
        isList: true,
      },
    ],
    errors: [VALIDATION],
  },
  summary: {
    summary:
      'Resumo de "Seus ativos": valor atual (USDT, do candle mais novo), custo, resultado, alvo e stop sobre o preço médio (padrão +10% e −8%, com a saída já descontada) e, com uma estratégia escolhida, a regra do dia: segurar, vender ou aguardar.',
    tag: TAG,
    query: z.strictObject({
      strategyId: resourceIdSchema.optional(),
      targetRate: z.string().optional().describe('Alvo sobre o preço médio: "0.1" = +10%.'),
      stopRate: z.string().optional().describe('Stop sobre o preço médio: "0.08" = −8%.'),
    }),
    successes: [{ status: HTTP_STATUS.OK, description: 'O resumo.', schema: ASSET_SUMMARY_SCHEMA }],
    errors: [
      VALIDATION,
      { status: HTTP_STATUS.NOT_FOUND, code: STRATEGY_ERROR_CODE.STRATEGY_NOT_FOUND },
      { status: HTTP_STATUS.CONFLICT, code: 'GOAL_PLAN_UNAVAILABLE' },
    ],
  },
  get: {
    summary: 'Um ativo.',
    tag: TAG,
    params: PARAMS,
    successes: ASSET_OK,
    errors: [NOT_FOUND],
  },
  replace: {
    summary:
      'Cadastra ou substitui a posição como o usuário a digitou (quantidade e preço médio). Só pares habilitados; há um teto de ativos por usuário.',
    tag: TAG,
    params: PARAMS,
    body: z.strictObject({
      quantity: z.string().describe('Quantidade em texto decimal, até 8 casas.'),
      averagePrice: z.string().describe('Preço médio em texto decimal, até 8 casas.'),
    }),
    successes: ASSET_OK,
    errors: [VALIDATION, LIMIT],
  },
  trade: {
    summary:
      'Registra uma COMPRA (soma à quantidade e recalcula o preço médio PONDERADO, arredondado para cima) ou uma VENDA (desconta; nunca passa da quantidade; o preço médio não muda).',
    tag: TAG,
    params: PARAMS,
    body: z.union([
      z.strictObject({ side: z.literal('buy'), quantity: z.string(), price: z.string() }),
      z.strictObject({ side: z.literal('sell'), quantity: z.string() }),
    ]),
    successes: ASSET_OK,
    errors: [
      VALIDATION,
      NOT_FOUND,
      LIMIT,
      { status: HTTP_STATUS.CONFLICT, code: USER_ASSET_ERROR_CODE.ASSET_INSUFFICIENT_QUANTITY },
    ],
  },
  delete: {
    summary: 'Apaga um ativo.',
    tag: TAG,
    params: PARAMS,
    successes: [{ status: HTTP_STATUS.NO_CONTENT, description: 'Apagado.' }],
    errors: [NOT_FOUND],
  },
} as const satisfies Readonly<Record<string, RouteDocumentation>>;
