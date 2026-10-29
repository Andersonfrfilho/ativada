// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import {
  TRANSCRIPTION_ERROR_CODE,
  VALIDATION_ERROR_CODE,
} from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import { ACCEPTED_AUDIO_TYPES } from './transcription.constant.js';
import { TRANSCRIPTION_SCHEMA } from './transcriptions.schema.js';

export const TRANSCRIPTIONS_DOCUMENTATION: RouteDocumentation = {
  summary:
    'Pergunta por voz: transcreve a fala do usuário para texto NA MÁQUINA do servidor (whisper.cpp, `TRANSCRIPTION_ENGINE=' +
    'whisper_local`); o áudio nunca sai dela e nem o áudio nem o texto vão a log. O corpo é o áudio cru (até 2 MB) com o ' +
    '`Content-Type` do gravador (`audio/webm`, `audio/ogg`, `audio/mp4` ou `audio/wav`, com `;codecs=` opcional). Uma ' +
    'transcrição por vez na instância e até 3 esperando; acima disso 503 `TRANSCRIPTION_BUSY`. Motor desligado: 503 ' +
    '`TRANSCRIPTION_UNAVAILABLE`. `text` vem aparado e pode ser vazio (silêncio); quem escolhe a pergunta é o painel.',
  tag: 'Transcrição',
  bodyContentTypes: ACCEPTED_AUDIO_TYPES,
  successes: [
    { status: HTTP_STATUS.OK, description: 'O texto falado.', schema: TRANSCRIPTION_SCHEMA },
  ],
  errors: [
    { status: HTTP_STATUS.BAD_REQUEST, code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED },
    { status: HTTP_STATUS.PAYLOAD_TOO_LARGE, code: TRANSCRIPTION_ERROR_CODE.AUDIO_TOO_LARGE },
    {
      status: HTTP_STATUS.UNPROCESSABLE_CONTENT,
      code: TRANSCRIPTION_ERROR_CODE.TRANSCRIPTION_FAILED,
    },
    {
      status: HTTP_STATUS.SERVICE_UNAVAILABLE,
      code: TRANSCRIPTION_ERROR_CODE.TRANSCRIPTION_UNAVAILABLE,
    },
    { status: HTTP_STATUS.SERVICE_UNAVAILABLE, code: TRANSCRIPTION_ERROR_CODE.TRANSCRIPTION_BUSY },
    {
      status: HTTP_STATUS.SERVICE_UNAVAILABLE,
      code: TRANSCRIPTION_ERROR_CODE.TRANSCRIPTION_ENGINE_FAILED,
    },
  ],
};
