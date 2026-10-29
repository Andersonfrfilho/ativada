// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { Route } from '../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { readAudioBody } from './read-audio-body.js';
import { TRANSCRIPTION_RATE_LIMIT_POLICY } from './transcription-rate-limit.constant.js';
import { TRANSCRIPTIONS_PATH } from './transcription.constant.js';
import type { TranscribeAudioUseCase } from './transcribe-audio.use-case.js';
import { TRANSCRIPTIONS_DOCUMENTATION } from './transcriptions.docs.js';

export type TranscriptionRouteDependencies = {
  readonly transcribe: TranscribeAudioUseCase;
};

// Balde próprio (`transcription`, 6 por minuto): cada pedido ocupa a CPU inteira por alguns segundos.
export function createTranscriptionsRoute(dependencies: TranscriptionRouteDependencies): Route {
  return {
    method: HTTP_METHOD.POST,
    path: TRANSCRIPTIONS_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: TRANSCRIPTION_RATE_LIMIT_POLICY,
    documentation: TRANSCRIPTIONS_DOCUMENTATION,
    handler: async (context): Promise<RouteResult> => ({
      status: HTTP_STATUS.OK,
      data: await dependencies.transcribe(await readAudioBody(context.request)),
    }),
  };
}
