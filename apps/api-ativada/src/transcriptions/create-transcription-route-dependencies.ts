// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Logger } from '../logging/logger.js';
import type { AudioTranscriberPort } from './audio-transcriber.port.js';
import { createTranscribeAudioUseCase } from './transcribe-audio.use-case.js';
import { createTranscriptionGate } from './transcription-gate.js';
import {
  TRANSCRIPTION_FAILED_LOG_MESSAGE,
  TRANSCRIPTION_MAX_WAITING,
} from './transcription.constant.js';
import type { TranscriptionRouteDependencies } from './transcriptions.route.js';

export function createTranscriptionRouteDependencies(params: {
  readonly transcriber: AudioTranscriberPort | undefined;
  readonly logger: Logger;
}): TranscriptionRouteDependencies {
  return {
    transcribe: createTranscribeAudioUseCase({
      transcriber: params.transcriber,
      gate: createTranscriptionGate(TRANSCRIPTION_MAX_WAITING),
      reportFailure: (failure) => params.logger.warn(TRANSCRIPTION_FAILED_LOG_MESSAGE, failure),
    }),
  };
}
