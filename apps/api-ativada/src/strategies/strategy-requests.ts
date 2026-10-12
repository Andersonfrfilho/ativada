// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';
import {
  createStrategyVersion,
  StrategyConfigError,
  type StrategyVersion,
} from '@ativada/strategy-engine';

import { STRATEGY_NAME_MAX_LENGTH, UNKNOWN_FIELD_REASON } from './strategy.constant.js';

const nameSchema = z.string().trim().min(1).max(STRATEGY_NAME_MAX_LENGTH);

const UNRECOGNIZED_KEY_PATTERN = /^Unrecognized keys?:/;

// O esquema do motor cita o NOME da chave desconhecida na mensagem: o texto enviado não volta, só o motivo estável.
function toReason(message: string): string {
  return UNRECOGNIZED_KEY_PATTERN.test(message) ? UNKNOWN_FIELD_REASON : message;
}

// A configuração é validada pelo esquema do MOTOR, no mesmo passo do corpo: todos os problemas (do nome e da
// configuração) saem juntos, cada um com o caminho `config.<campo>`.
export const strategyConfigSchema = z.unknown().transform((input, context): StrategyVersion => {
  try {
    return createStrategyVersion(input);
  } catch (error: unknown) {
    if (!(error instanceof StrategyConfigError)) throw error;
    for (const issue of error.issues) {
      const path = issue.path.length > 0 ? issue.path.split('.') : [];
      context.addIssue({ code: 'custom', path, message: toReason(issue.message) });
    }
    return z.NEVER;
  }
});

export const createStrategySchema = z.strictObject({
  name: nameSchema,
  config: strategyConfigSchema,
});
export const addVersionSchema = z.strictObject({ config: strategyConfigSchema });
