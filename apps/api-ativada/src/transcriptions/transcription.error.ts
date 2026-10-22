// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DomainError } from '../shared/errors/domain.error.js';
import { TRANSCRIPTION_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';

export class TranscriptionUnavailableError extends DomainError {
  constructor() {
    super({
      code: TRANSCRIPTION_ERROR_CODE.TRANSCRIPTION_UNAVAILABLE,
      message: 'A transcrição de voz está desligada neste servidor.',
      status: HTTP_STATUS.SERVICE_UNAVAILABLE,
    });
  }
}

export class TranscriptionBusyError extends DomainError {
  constructor() {
    super({
      code: TRANSCRIPTION_ERROR_CODE.TRANSCRIPTION_BUSY,
      message: 'Muitas transcrições na fila. Tente de novo em instantes.',
      status: HTTP_STATUS.SERVICE_UNAVAILABLE,
    });
  }
}

// O áudio não decodifica ou o motor recusou de forma definitiva: repetir o mesmo áudio não adianta.
export class TranscriptionFailedError extends DomainError {
  constructor() {
    super({
      code: TRANSCRIPTION_ERROR_CODE.TRANSCRIPTION_FAILED,
      message: 'Não foi possível transcrever este áudio.',
      status: HTTP_STATUS.UNPROCESSABLE_CONTENT,
    });
  }
}

// O motor caiu, estourou o tempo ou terminou sem texto: tentar de novo pode dar certo.
export class TranscriptionEngineFailedError extends DomainError {
  constructor() {
    super({
      code: TRANSCRIPTION_ERROR_CODE.TRANSCRIPTION_ENGINE_FAILED,
      message: 'A transcrição falhou. Tente de novo.',
      status: HTTP_STATUS.SERVICE_UNAVAILABLE,
    });
  }
}

export class AudioTooLargeError extends DomainError {
  constructor() {
    super({
      code: TRANSCRIPTION_ERROR_CODE.AUDIO_TOO_LARGE,
      message: 'O áudio passa do tamanho máximo.',
      status: HTTP_STATUS.PAYLOAD_TOO_LARGE,
    });
  }
}
