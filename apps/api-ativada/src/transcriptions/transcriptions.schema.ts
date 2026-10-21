// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

export const TRANSCRIPTION_SCHEMA = z.strictObject({
  text: z.string(),
  engine: z.string(),
});
