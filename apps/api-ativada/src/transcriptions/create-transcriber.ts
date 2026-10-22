// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createWhisperLocalTranscriber } from '@adatechnology/audio-transcription-provider/whisper-local';

import type { AudioTranscriberPort } from './audio-transcriber.port.js';
import {
  TRANSCRIPTION_ENGINE,
  TRANSCRIPTION_LANGUAGE_HINT,
  TRANSCRIPTION_TIMEOUT_MILLISECONDS,
  type TranscriptionEngine,
} from './transcription.constant.js';

const WAV_AUDIO_TYPE = 'audio/wav';
const UNKNOWN_AUDIO_TYPE = 'application/octet-stream';

export type TranscriberSettings = {
  readonly TRANSCRIPTION_ENGINE: TranscriptionEngine;
  readonly WHISPER_CLI_PATH?: string | undefined;
  readonly WHISPER_MODEL_PATH?: string | undefined;
  readonly WHISPER_THREADS?: number | undefined;
};

// No SDK 0.1.0 entrada WAV e saída caem no mesmo `source.wav`; sem a dica de extensão o ffmpeg reconhece o WAV pelo conteúdo.
function toSdkMimeType(mimeType: string): string {
  return mimeType === WAV_AUDIO_TYPE ? UNKNOWN_AUDIO_TYPE : mimeType;
}

// Motor desligado (ou sem caminho, que o ambiente já recusa) = nenhuma porta: a rota responde 503 sem tocar no áudio.
export function createTranscriber(settings: TranscriberSettings): AudioTranscriberPort | undefined {
  const modelPath = settings.WHISPER_MODEL_PATH;
  const binaryPath = settings.WHISPER_CLI_PATH;
  if (settings.TRANSCRIPTION_ENGINE !== TRANSCRIPTION_ENGINE.WHISPER_LOCAL) return undefined;
  if (modelPath === undefined || binaryPath === undefined) return undefined;
  const whisper = createWhisperLocalTranscriber({
    modelPath,
    binaryPath,
    languageHint: TRANSCRIPTION_LANGUAGE_HINT,
    timeoutMs: TRANSCRIPTION_TIMEOUT_MILLISECONDS,
    ...(settings.WHISPER_THREADS === undefined ? {} : { threads: settings.WHISPER_THREADS }),
  });
  return {
    name: whisper.name,
    transcribe: (input) =>
      whisper.transcribe({ ...input, mimeType: toSdkMimeType(input.mimeType) }),
  };
}
