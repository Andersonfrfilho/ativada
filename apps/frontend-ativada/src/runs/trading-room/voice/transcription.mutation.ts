// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_METHOD } from '@ativada/environment';
import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { API_PATH } from '../../../app/app.constant.js';
import { useApiClient } from '../../../app/useAppContext.hook.js';
import { transcriptionSchema, type Transcription } from './transcription.validation.js';

// O áudio vai cru ao servidor, que transcreve na própria máquina (whisper.cpp); nada fica guardado no navegador.
export function useTranscriptionMutation(): UseMutationResult<Transcription, Error, Blob> {
  const client = useApiClient();
  return useMutation({
    mutationFn: (audio: Blob) =>
      client.request({
        path: API_PATH.TRANSCRIPTIONS,
        method: HTTP_METHOD.POST,
        rawBody: audio,
        schema: transcriptionSchema,
      }),
  });
}
