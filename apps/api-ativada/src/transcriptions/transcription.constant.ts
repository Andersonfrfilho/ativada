// Copyright (c) 2026 Ada Technology. All rights reserved.
export const TRANSCRIPTIONS_PATH = '/v1/transcriptions';

export const TRANSCRIPTION_ENGINE = {
  OFF: 'off',
  WHISPER_LOCAL: 'whisper_local',
} as const;

export type TranscriptionEngine = (typeof TRANSCRIPTION_ENGINE)[keyof typeof TRANSCRIPTION_ENGINE];

// Uma pergunta falada de até 20 s em Opus cabe em bem menos que isto; o teto existe para o corpo nunca virar arquivo.
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

// O mime sem os parâmetros (`;codecs=opus`): o ffmpeg detecta o resto pelo conteúdo.
export const ACCEPTED_AUDIO_TYPES: readonly string[] = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/wav',
];

// Uma transcrição por vez na instância (o whisper.cpp ocupa todos os núcleos) e poucas esperando; acima disso, 503.
export const TRANSCRIPTION_MAX_WAITING = 3;
export const TRANSCRIPTION_TIMEOUT_MILLISECONDS = 60_000;
export const TRANSCRIPTION_LANGUAGE_HINT = 'pt';

export const AUDIO_VALIDATION_REASON = {
  EMPTY: 'empty_audio',
  UNSUPPORTED_TYPE: 'unsupported_audio_type',
} as const;

export const TRANSCRIPTION_FAILED_LOG_MESSAGE = 'transcription failed';
