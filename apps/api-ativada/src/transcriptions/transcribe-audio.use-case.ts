// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readErrorName } from '@ativada/environment';

import { DomainError } from '../shared/errors/domain.error.js';
import type {
  AudioTranscriberPort,
  TranscriptionOutput,
  TranscriptionRequest,
} from './audio-transcriber.port.js';
import type { TranscriptionGate } from './transcription-gate.js';
import {
  TranscriptionEngineFailedError,
  TranscriptionFailedError,
  TranscriptionUnavailableError,
} from './transcription.error.js';

export type TranscriptionFailure = { readonly errorName: string; readonly errorCode: string };

export type TranscribeAudioDependencies = {
  readonly transcriber: AudioTranscriberPort | undefined;
  readonly gate: TranscriptionGate;
  // Só o nome do erro e o código estável: a mensagem do SDK pode citar caminho de arquivo, e o texto e o áudio nunca vão a log.
  readonly reportFailure: (failure: TranscriptionFailure) => void;
};

export type TranscribeAudioUseCase = (input: TranscriptionRequest) => Promise<TranscriptionOutput>;

// O SDK marca o erro definitivo com `isRetriable: false` (áudio que não decodifica); o resto (queda, tempo) pode dar certo de novo.
function isDefinitiveFailure(error: unknown): boolean {
  return error instanceof Error && 'isRetriable' in error && error.isRetriable === false;
}

function toDomainError(error: unknown): DomainError {
  if (isDefinitiveFailure(error)) return new TranscriptionFailedError();
  return new TranscriptionEngineFailedError();
}

export function createTranscribeAudioUseCase(
  dependencies: TranscribeAudioDependencies,
): TranscribeAudioUseCase {
  return async (input) => {
    const { transcriber } = dependencies;
    if (transcriber === undefined) throw new TranscriptionUnavailableError();
    return dependencies.gate.run(async () => {
      try {
        const result = await transcriber.transcribe(input);
        return { text: result.text.trim(), engine: result.engine };
      } catch (error: unknown) {
        const domainError = toDomainError(error);
        dependencies.reportFailure({
          errorName: readErrorName(error),
          errorCode: domainError.code,
        });
        throw domainError;
      }
    });
  };
}
