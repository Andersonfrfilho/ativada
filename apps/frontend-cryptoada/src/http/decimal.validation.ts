// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

// Valor numérico da API é texto decimal puro: "NaN", notação científica ou lixo reprova no esquema, nunca chega à tela.
export const decimalText = z.string().regex(/^-?\d+(\.\d+)?$/);
export const nullableDecimalText = decimalText.nullable();
