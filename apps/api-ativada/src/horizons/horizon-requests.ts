// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

export const HORIZON_REASON = { NOT_ENABLED: 'not_enabled' } as const;

const TEXT_MAXIMUM = 64;

export type HorizonsQuery = {
  readonly symbol: string;
  // Texto cru: o id malformado é tratado como estratégia inexistente (o mesmo 404), nunca como erro de validação.
  readonly strategyId?: string | undefined;
};

// `symbol` é obrigatório e precisa estar habilitado; os erros saem com o caminho e o motivo estável, nunca com o valor.
export function createHorizonsQuerySchema(
  enabledSymbols: readonly string[],
): z.ZodType<HorizonsQuery> {
  return z.strictObject({
    symbol: z
      .string()
      .max(TEXT_MAXIMUM)
      .refine((symbol) => enabledSymbols.includes(symbol), { error: HORIZON_REASON.NOT_ENABLED }),
    strategyId: z.string().max(TEXT_MAXIMUM).optional(),
  });
}
