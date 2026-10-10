// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { Route } from '../router/route.types.js';
import { HTTP_HEADER, HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import { readValidatedQuery } from '../shared/http/read-validated-query.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { CSV_CONTENT_TYPE, CSV_TABLE_NAMES, DEFAULT_CSV_TABLE } from './csv-tables.constant.js';
import type { ExportRunCsvUseCase } from './export-run-csv.use-case.js';
import { readRunId } from './run-id.js';
import { RUN_DOCUMENTATION } from './runs.docs.js';
import { RUN_EXPORT_PATH } from './runs.constant.js';

const exportQuerySchema = z.strictObject({ table: z.enum(CSV_TABLE_NAMES).optional() });

export function createRunExportRoutes(exportRunCsv: ExportRunCsvUseCase): readonly Route[] {
  return [
    {
      method: HTTP_METHOD.GET,
      path: RUN_EXPORT_PATH,
      access: ROUTE_ACCESS.USER,
      rateLimitPolicy: RATE_LIMIT_POLICY.RUN_EXPORT,
      documentation: RUN_DOCUMENTATION.exportCsv,
      handler: async (context): Promise<RouteResult> => {
        const runId = readRunId(context);
        const query = readValidatedQuery(context.request, exportQuerySchema);
        const exported = await exportRunCsv(context.scope, runId, query.table ?? DEFAULT_CSV_TABLE);
        return {
          status: HTTP_STATUS.OK,
          rawBody: exported.body,
          headers: {
            [HTTP_HEADER.CONTENT_TYPE]: CSV_CONTENT_TYPE,
            [HTTP_HEADER.CONTENT_DISPOSITION]: `attachment; filename="${exported.fileName}"`,
          },
        };
      },
    },
  ];
}
