// Copyright (c) 2026 Ada Technology. All rights reserved.
import { homePathSchema, z } from '@ativada/environment';

import { TRANSCRIPTION_ENGINE } from './transcription.constant.js';

const THREADS_EXPECTATION = 'inteiro entre 1 e 32';
const MAX_THREADS = 32;
const REQUIRED_PATH_EXPECTATION = 'obrigatório com TRANSCRIPTION_ENGINE=whisper_local';

// A transcrição da pergunta falada roda NA MÁQUINA (whisper.cpp): o áudio nunca sai dela. Desligada por padrão.
export const transcriptionEnvironmentShape = {
  TRANSCRIPTION_ENGINE: z
    .enum(Object.values(TRANSCRIPTION_ENGINE))
    .default(TRANSCRIPTION_ENGINE.OFF),
  WHISPER_CLI_PATH: homePathSchema.optional(),
  WHISPER_MODEL_PATH: homePathSchema.optional(),
  WHISPER_THREADS: z.coerce
    .number({ error: THREADS_EXPECTATION })
    .int({ error: THREADS_EXPECTATION })
    .min(1, { error: THREADS_EXPECTATION })
    .max(MAX_THREADS, { error: THREADS_EXPECTATION })
    .optional(),
} as const;

type TranscriptionValues = {
  readonly TRANSCRIPTION_ENGINE: string;
  readonly WHISPER_CLI_PATH?: string | undefined;
  readonly WHISPER_MODEL_PATH?: string | undefined;
};

export function checkTranscription(values: TranscriptionValues, context: z.RefinementCtx): void {
  if (values.TRANSCRIPTION_ENGINE !== TRANSCRIPTION_ENGINE.WHISPER_LOCAL) return;
  for (const name of ['WHISPER_CLI_PATH', 'WHISPER_MODEL_PATH'] as const) {
    if (values[name] !== undefined) continue;
    context.addIssue({ code: 'custom', message: REQUIRED_PATH_EXPECTATION, path: [name] });
  }
}
