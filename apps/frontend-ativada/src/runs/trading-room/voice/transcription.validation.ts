// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

// Espelho de `POST /v1/transcriptions` (pergunta por voz): o texto falado, já aparado, e o motor que transcreveu.
export const transcriptionSchema = z.object({
  text: z.string(),
  engine: z.string(),
});

export type Transcription = z.infer<typeof transcriptionSchema>;
