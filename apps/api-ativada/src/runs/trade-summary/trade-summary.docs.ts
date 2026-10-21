// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import type { RouteDocumentation } from '../../openapi/route-documentation.types.js';
import { decimalTextSchema, pathIdSchema } from '../../openapi/schema-primitives.js';
import { RUN_ERROR_CODE, VALIDATION_ERROR_CODE } from '../../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../../shared/http/http.constant.js';
import { RUN_ID_PARAM } from '../runs.constant.js';

export const tradeSummaryQuerySchema = z.strictObject({});

const TRADE_SUMMARY_SCHEMA = z.strictObject({
  closedTrades: z.number().int().nonnegative(),
  totalPaid: decimalTextSchema,
  totalReceived: decimalTextSchema,
  totalFees: decimalTextSchema,
  net: decimalTextSchema,
  openTrades: z.number().int().nonnegative(),
  openPaid: decimalTextSchema.nullable(),
  message: z.string(),
});

export const RUN_TRADE_SUMMARY_DOCUMENTATION: RouteDocumentation = {
  summary:
    'Resumo das operações da execução inteira (não muda com o zoom do gráfico): total pago, recebido, taxas e saldo ' +
    'líquido das fechadas, mais o pago nas abertas, em decimal exato, e a frase pronta em português. O saldo líquido é ' +
    'recebido - pago e fecha com a soma de `netProfit` das operações.',
  tag: 'Execuções — séries',
  params: pathIdSchema(RUN_ID_PARAM),
  query: tradeSummaryQuerySchema,
  successes: [
    {
      status: HTTP_STATUS.OK,
      description: 'Os totais das operações e a frase do resumo.',
      schema: TRADE_SUMMARY_SCHEMA,
    },
  ],
  errors: [
    { status: HTTP_STATUS.BAD_REQUEST, code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED },
    { status: HTTP_STATUS.NOT_FOUND, code: RUN_ERROR_CODE.RUN_NOT_FOUND },
  ],
};
