// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from 'zod';

import { PRODUCTION_ENVIRONMENT } from './production-rules.js';

const URL_EXPECTATION = 'URL http:// ou https://';
const WEBSOCKET_URL_EXPECTATION = 'URL ws:// ou wss://';
const NON_EMPTY_TEXT_EXPECTATION = 'texto não vazio';
const ENV_EXPECTATION = 'dev, test ou production';

export const httpUrlSchema = z.url({ protocol: /^https?$/, error: URL_EXPECTATION });

export const webSocketUrlSchema = z.url({
  protocol: /^wss?$/,
  error: WEBSOCKET_URL_EXPECTATION,
});

export const nonEmptyTextSchema = z
  .string({ error: NON_EMPTY_TEXT_EXPECTATION })
  .min(1, { error: NON_EMPTY_TEXT_EXPECTATION });

export const environmentNameSchema = z.enum(['dev', 'test', PRODUCTION_ENVIRONMENT], {
  error: ENV_EXPECTATION,
});

const LIST_SEPARATOR = ',';

export const commaSeparatedTextSchema = z
  .string()
  .transform((text) => text.split(LIST_SEPARATOR).map((entry) => entry.trim()));
