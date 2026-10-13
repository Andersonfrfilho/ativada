// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';
import { EXIT_REASON } from '@ativada/strategy-engine';

import type { RouteDocumentation } from '../../openapi/route-documentation.types.js';
import {
  decimalTextSchema,
  epochMillisecondsSchema,
  pathIdSchema,
} from '../../openapi/schema-primitives.js';
import { RUN_ERROR_CODE, VALIDATION_ERROR_CODE } from '../../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../../shared/http/http.constant.js';
import { RUN_ID_PARAM } from '../runs.constant.js';
import { tradesQuerySchema } from './run-trades.schema.js';

const optionalDecimal = decimalTextSchema.optional();

// Os campos de antes continuam com o mesmo nome e tipo; os de baixo (spec 005) só acrescentam.
const TRADE_SCHEMA = z.strictObject({
  engineKey: z.string(),
  status: z.enum(['open', 'closed']),
  entryPrice: decimalTextSchema,
  quantity: decimalTextSchema,
  stopPrice: decimalTextSchema,
  targetPrice: decimalTextSchema,
  entryFee: decimalTextSchema,
  exitPrice: optionalDecimal,
  exitFee: optionalDecimal,
  netProfit: optionalDecimal,
  exitReason: z.enum(EXIT_REASON).optional(),
  openedCandleTime: epochMillisecondsSchema,
  closedCandleTime: epochMillisecondsSchema.optional(),
  entryNotional: optionalDecimal,
  exitNotional: optionalDecimal,
  paid: optionalDecimal,
  received: optionalDecimal,
  fees: decimalTextSchema,
  netProfitRate: optionalDecimal,
});

export const RUN_TRADES_DOCUMENTATION: RouteDocumentation = {
  summary:
    'Operações (posições abertas e fechadas), em ordem de abertura. `from`/`to` (ms UTC, `[from, to)`) trazem as que ' +
    'compraram ou venderam na faixa; `status=open|closed` separa abertas de fechadas. Valor pago = notional da compra ' +
    'arredondado para cima + taxa; recebido = notional da venda arredondado para baixo - taxa; `netProfitRate` = ' +
    'resultado / pago, arredondado para baixo a 8 casas.',
  tag: 'Execuções — séries',
  params: pathIdSchema(RUN_ID_PARAM),
  query: tradesQuerySchema,
  successes: [
    {
      status: HTTP_STATUS.OK,
      description: 'Uma página de operações, por cursor.',
      schema: z.array(TRADE_SCHEMA),
      isList: true,
    },
  ],
  errors: [
    { status: HTTP_STATUS.BAD_REQUEST, code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED },
    { status: HTTP_STATUS.NOT_FOUND, code: RUN_ERROR_CODE.RUN_NOT_FOUND },
  ],
};
