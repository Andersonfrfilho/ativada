// Copyright (c) 2026 Ada Technology. All rights reserved.
import { resolveSymbolFilters } from '@ativada/market-data-crypto';
import { z } from '@ativada/environment';
import {
  createRunSetup,
  RunParametersError,
  RUN_PARAMETERS_SCHEMA_VERSION,
  type RunSetup,
} from '@ativada/strategy-engine';

import { DEFAULT_SENTIMENT_SOURCE, RUN_FIELD } from './runs.constant.js';

export const TEXT_MAXIMUM = 64;
const REFERENCE_SYMBOL = 'BTCUSDT';
const REFERENCE_TIMEFRAME = '1h';

export type RefinementContext = z.RefinementCtx;

export function addIssue(
  context: RefinementContext,
  path: readonly (string | number)[],
  message: string,
): void {
  context.addIssue({ code: 'custom', path: [...path], message });
}

// Só os campos que o usuário ajusta; o valor de cada um é conferido pelo esquema do MOTOR (RUN_PARAMETERS_SCHEMA).
const runParametersBodySchema = z.strictObject({
  initialBalance: z.string().max(TEXT_MAXIMUM).optional(),
  feeRate: z.string().max(TEXT_MAXIMUM).optional(),
  slippageRate: z.string().max(TEXT_MAXIMUM).optional(),
  tickSize: z.string().max(TEXT_MAXIMUM).optional(),
  quantityStep: z.string().max(TEXT_MAXIMUM).optional(),
  minNotional: z.string().max(TEXT_MAXIMUM).optional(),
  maxVolumeShare: z.string().max(TEXT_MAXIMUM).optional(),
  sentimentSource: z.string().min(1).max(TEXT_MAXIMUM).optional(),
});

export type ParametersInput = z.infer<typeof runParametersBodySchema> | undefined;

export function runSetupInput(
  symbol: string,
  timeframe: string,
  parameters: ParametersInput,
): unknown {
  return {
    schemaVersion: RUN_PARAMETERS_SCHEMA_VERSION,
    symbol,
    timeframe,
    sentimentSource: DEFAULT_SENTIMENT_SOURCE,
    ...resolveSymbolFilters(symbol),
    ...parameters,
  };
}

// Os problemas do esquema do motor entram com o caminho do corpo: `symbol` e `timeframe` ficam no topo, o resto em
// `runParameters`. Nenhuma mensagem carrega o valor enviado.
export function buildSetup(input: unknown, context: RefinementContext): RunSetup | undefined {
  try {
    return createRunSetup(input);
  } catch (error: unknown) {
    if (!(error instanceof RunParametersError)) throw error;
    for (const issue of error.issues) {
      const path = issue.path.length > 0 ? issue.path.split('.') : [];
      const isTopLevel = path[0] === 'symbol' || path[0] === 'timeframe';
      addIssue(context, isTopLevel ? path : [RUN_FIELD.RUN_PARAMETERS, ...path], issue.message);
    }
    return undefined;
  }
}

// Os valores de `runParameters` são conferidos já no campo (com um par de referência): assim os erros deles saem junto
// com os de `symbol` e `timeframe`, numa só resposta. O `setup` final usa o par de verdade.
export const checkedRunParametersSchema = runParametersBodySchema.transform(
  (parameters, context): z.infer<typeof runParametersBodySchema> => {
    const probe = runSetupInput(REFERENCE_SYMBOL, REFERENCE_TIMEFRAME, parameters);
    try {
      createRunSetup(probe);
    } catch (error: unknown) {
      if (!(error instanceof RunParametersError)) throw error;
      for (const issue of error.issues) {
        addIssue(context, issue.path.split('.'), issue.message);
      }
    }
    return parameters;
  },
);
