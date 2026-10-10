// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from 'zod';

import { decimalTextSchema } from './decimal-text.schema.js';
import {
  ENGINE_TIMEFRAME,
  MAX_INITIAL_BALANCE,
  RUN_PARAMETERS_SCHEMA_VERSION,
} from './engine.constant.js';

const ZERO = '0';
// Teto dos filtros de preço e quantidade da corretora (tick e passo).
const MAX_EXCHANGE_INCREMENT = '1000000';
// Taxa de 0,1% teto e tick de 0,01 do BTCUSDT: mesmo número, papéis diferentes.
const ONE_HUNDREDTH = '0.01';
const POSITIVE_INCREMENT_SCHEMA = decimalTextSchema({
  minimum: ZERO,
  maximum: MAX_EXCHANGE_INCREMENT,
  isMinimumExclusive: true,
});

// Entrada da execução (RF07, RF13, spec 002): saldo, taxa, slippage e filtros mudam sem mudar a lógica.
// Saldo em USDT (plan D7): só pares cotados em USDT.
export const RUN_PARAMETERS_SCHEMA = z.strictObject({
  schemaVersion: z.literal(RUN_PARAMETERS_SCHEMA_VERSION),
  symbol: z.string().regex(/^[A-Z0-9]{2,16}USDT$/, 'Use um par cotado em USDT, como "BTCUSDT".'),
  timeframe: z.enum(ENGINE_TIMEFRAME),
  initialBalance: decimalTextSchema({ minimum: '10', maximum: MAX_INITIAL_BALANCE }).default(
    '10000',
  ),
  feeRate: decimalTextSchema({ minimum: ZERO, maximum: ONE_HUNDREDTH }).default('0.001'),
  slippageRate: decimalTextSchema({ minimum: ZERO, maximum: '0.05' }).default('0.0005'),
  tickSize: POSITIVE_INCREMENT_SCHEMA.default(ONE_HUNDREDTH),
  quantityStep: POSITIVE_INCREMENT_SCHEMA.default('0.00001'),
  minNotional: decimalTextSchema({ minimum: ZERO, maximum: MAX_INITIAL_BALANCE }).default('5'),
  // Fração máxima do volume do candle de preenchimento que uma ordem consome (o resto não preenche).
  maxVolumeShare: decimalTextSchema({
    minimum: ZERO,
    maximum: '1',
    isMinimumExclusive: true,
  }).default(ONE_HUNDREDTH),
});
