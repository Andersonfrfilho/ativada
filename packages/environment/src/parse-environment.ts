// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from 'zod';
import { EnvironmentError } from './environment.error.js';

const MISSING_VARIABLE_REASON = 'obrigatória';
const UNNAMED_PATH = '(raiz)';

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function describeIssue(issue: z.core.$ZodIssue, source: EnvironmentSource): string {
  const variableName = issue.path.map(String).join('.') || UNNAMED_PATH;
  const rawValue = source[variableName];
  if (rawValue === undefined || rawValue.length === 0) {
    return `${variableName}: ${MISSING_VARIABLE_REASON}`;
  }
  return `${variableName}: valor inválido (esperado: ${issue.message})`;
}

export function parseEnvironment<TSchema extends z.ZodType>(
  schema: TSchema,
  source: EnvironmentSource,
): z.infer<TSchema> {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  throw new EnvironmentError(result.error.issues.map((issue) => describeIssue(issue, source)));
}
