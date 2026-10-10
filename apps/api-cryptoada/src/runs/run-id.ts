// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ProtectedRouteContext } from '../router/route.types.js';
import { parseResourceId } from '../shared/http/resource-id.js';
import { RunNotFoundError } from './run.error.js';
import { RUN_ID_PARAM } from './runs.constant.js';

// Id malformado no caminho é o mesmo `RUN_NOT_FOUND` do inexistente: nunca vai para a consulta.
export function readRunId(context: ProtectedRouteContext): string {
  const runId = parseResourceId(context.pathParams[RUN_ID_PARAM]);
  if (runId === undefined) throw new RunNotFoundError();
  return runId;
}
