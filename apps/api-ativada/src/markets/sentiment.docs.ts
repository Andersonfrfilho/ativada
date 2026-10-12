// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import { SENTIMENT_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import { SENTIMENT_SOURCE } from './sentiment.constant.js';

const SENTIMENT_VIEW_SCHEMA = z.strictObject({
  fearGreed: z.number().int().min(0).max(100),
  classification: z.string().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.strictObject({
    name: z.literal(SENTIMENT_SOURCE.name),
    creditText: z.literal(SENTIMENT_SOURCE.creditText),
    url: z.literal(SENTIMENT_SOURCE.url),
  }),
});

export const SENTIMENT_DOCUMENTATION: RouteDocumentation = {
  summary:
    'O valor mais recente do índice Fear & Greed (0 a 100) coletado da alternative.me, com a classificação, a data e o crédito da fonte, que toda tela que exibir o índice precisa mostrar com o link.',
  tag: 'Mercado',
  successes: [
    {
      status: HTTP_STATUS.OK,
      description: 'O índice do dia mais recente coletado.',
      schema: SENTIMENT_VIEW_SCHEMA,
    },
  ],
  errors: [{ status: HTTP_STATUS.NOT_FOUND, code: SENTIMENT_ERROR_CODE.SENTIMENT_UNAVAILABLE }],
};
