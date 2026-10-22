// Copyright (c) 2026 Ada Technology. All rights reserved.

// A gravação para sozinha aqui: uma pergunta rápida cabe em bem menos, e o áudio não passa do teto do servidor.
export const MAX_RECORDING_SECONDS = 20;
export const DEFAULT_AUDIO_TYPE = 'audio/webm';

export const VOICE_ERROR = {
  MICROPHONE: 'microphone',
  UNAVAILABLE: 'unavailable',
  BUSY: 'busy',
  FAILED: 'failed',
} as const;
export type VoiceError = (typeof VOICE_ERROR)[keyof typeof VOICE_ERROR];

export const VOICE_TEXT = {
  START: 'Perguntar falando',
  TRANSCRIBING: 'Transcrevendo…',
  ASK: 'Perguntar',
  CANCEL: 'Cancelar',
  NOT_UNDERSTOOD: 'Não entendi qual pergunta. Escolha uma abaixo.',
  SILENCE: 'Não ouvi nada. Tente de novo, mais perto do microfone.',
  PRIVACY: 'O áudio é transcrito no servidor do AtivAdA e não é guardado.',
} as const;

export function recordingLabel(seconds: number): string {
  return `Gravando… toque para parar (${seconds} s de ${MAX_RECORDING_SECONDS})`;
}

export function heardText(text: string): string {
  return `Você disse: “${text}”`;
}

export function understoodText(question: string, coin: string): string {
  return `Entendi: ${question} · ${coin}`;
}

export function unavailableCoinText(spoken: string, current: string): string {
  return `${spoken} não está disponível aqui; a pergunta vai para ${current}.`;
}

export const VOICE_ERROR_TEXT: Readonly<Record<VoiceError, string>> = {
  [VOICE_ERROR.MICROPHONE]:
    'Não foi possível usar o microfone. Confira a permissão do navegador para este site.',
  [VOICE_ERROR.UNAVAILABLE]: 'A pergunta por voz está desligada neste servidor.',
  [VOICE_ERROR.BUSY]:
    'O servidor está ocupado com outras transcrições. Tente de novo em instantes.',
  [VOICE_ERROR.FAILED]: 'Não foi possível entender o áudio. Tente de novo.',
};
