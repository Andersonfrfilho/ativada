// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

// Preço e volume cruzam a borda como string decimal exata, nunca como float.
export const DECIMAL_STRING_SCHEMA = z.string().regex(DECIMAL_PATTERN);
export const TIMESTAMP_SCHEMA = z.number().int().nonnegative();
