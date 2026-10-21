// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_HEADER } from '../shared/http/http.constant.js';
import { RequestValidationError } from '../shared/http/request-validation.error.js';
import type { TranscriptionRequest } from './audio-transcriber.port.js';
import {
  ACCEPTED_AUDIO_TYPES,
  AUDIO_VALIDATION_REASON,
  MAX_AUDIO_BYTES,
} from './transcription.constant.js';
import { AudioTooLargeError } from './transcription.error.js';

const BODY_FIELD = '(body)';

function readAudioMimeType(contentType: string | null): string {
  const mimeType = (contentType?.split(';')[0] ?? '').trim().toLowerCase();
  if (ACCEPTED_AUDIO_TYPES.includes(mimeType)) return mimeType;
  throw new RequestValidationError([
    { field: HTTP_HEADER.CONTENT_TYPE, reason: AUDIO_VALIDATION_REASON.UNSUPPORTED_TYPE },
  ]);
}

// O corpo é o áudio cru (não JSON): o tipo vem do `Content-Type`, o tamanho é conferido antes e depois de ler.
export async function readAudioBody(request: Request): Promise<TranscriptionRequest> {
  const mimeType = readAudioMimeType(request.headers.get(HTTP_HEADER.CONTENT_TYPE));
  const declaredLength = Number(request.headers.get(HTTP_HEADER.CONTENT_LENGTH) ?? 0);
  if (declaredLength > MAX_AUDIO_BYTES) throw new AudioTooLargeError();
  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length > MAX_AUDIO_BYTES) throw new AudioTooLargeError();
  if (buffer.length === 0) {
    throw new RequestValidationError([
      { field: BODY_FIELD, reason: AUDIO_VALIDATION_REASON.EMPTY },
    ]);
  }
  return { buffer, mimeType };
}
