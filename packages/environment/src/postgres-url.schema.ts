// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from 'zod';

const POSTGRES_URL_EXPECTATION = 'URL postgres:// ou postgresql://';
const POSTGRES_PROTOCOL_PATTERN = /^postgres(ql)?$/;

export const postgresUrlSchema = z.url({
  protocol: POSTGRES_PROTOCOL_PATTERN,
  error: POSTGRES_URL_EXPECTATION,
});
