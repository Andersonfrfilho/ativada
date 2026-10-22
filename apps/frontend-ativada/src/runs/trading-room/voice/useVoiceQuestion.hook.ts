// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useRef, useState } from 'react';

import { ApiError } from '../../../http/api.error.js';
import { useTranscriptionMutation } from './transcription.mutation.js';
import { MAX_RECORDING_SECONDS, VOICE_ERROR, type VoiceError } from './voice-ask.constant.js';
import { isVoiceSupported, startRecording, type RecordingHandle } from './voice-recorder.js';

export type VoiceState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'recording'; readonly seconds: number }
  | { readonly kind: 'transcribing' }
  | { readonly kind: 'heard'; readonly text: string }
  | { readonly kind: 'error'; readonly reason: VoiceError };

export type VoiceQuestion = {
  readonly isSupported: boolean;
  readonly state: VoiceState;
  readonly start: () => void;
  readonly stop: () => void;
  readonly reset: () => void;
};

const IDLE: VoiceState = { kind: 'idle' };
const ONE_SECOND = 1_000;

function reasonOf(error: Error): VoiceError {
  if (!(error instanceof ApiError)) return VOICE_ERROR.FAILED;
  if (error.code === 'TRANSCRIPTION_UNAVAILABLE') return VOICE_ERROR.UNAVAILABLE;
  if (error.code === 'TRANSCRIPTION_BUSY' || error.code === 'RATE_LIMITED') return VOICE_ERROR.BUSY;
  return VOICE_ERROR.FAILED;
}

// Conta os segundos da gravação e a para sozinha no teto; o relógio só existe enquanto grava.
function useRecordingClock(
  isRecording: boolean,
  handle: { readonly current: RecordingHandle | undefined },
  setState: (state: VoiceState) => void,
): void {
  useEffect(() => {
    if (!isRecording) return undefined;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / ONE_SECOND);
      if (seconds >= MAX_RECORDING_SECONDS) handle.current?.stop();
      else setState({ kind: 'recording', seconds });
    }, ONE_SECOND);
    return (): void => clearInterval(timer);
  }, [isRecording, handle, setState]);
}

// Grava, manda o áudio ao servidor e guarda o texto ouvido; quem decide a pergunta é `matchSpokenQuestion`, na tela.
export function useVoiceQuestion(): VoiceQuestion {
  const [isSupported] = useState(isVoiceSupported);
  const [state, setState] = useState<VoiceState>(IDLE);
  const handle = useRef<RecordingHandle | undefined>(undefined);
  const isMounted = useRef(true);
  const transcription = useTranscriptionMutation();
  useEffect(() => {
    isMounted.current = true;
    return (): void => {
      isMounted.current = false;
      handle.current?.release();
    };
  }, []);
  useRecordingClock(state.kind === 'recording', handle, setState);
  function upload(audio: Blob): void {
    handle.current = undefined;
    setState({ kind: 'transcribing' });
    transcription.mutate(audio, {
      onSuccess: (data) => setState({ kind: 'heard', text: data.text }),
      onError: (error) => setState({ kind: 'error', reason: reasonOf(error) }),
    });
  }
  // A permissão do microfone pode chegar depois que a tela saiu: aí a gravação é solta na hora.
  async function start(): Promise<void> {
    setState({ kind: 'recording', seconds: 0 });
    try {
      const recording = await startRecording(upload);
      if (isMounted.current) handle.current = recording;
      else recording.release();
    } catch {
      setState({ kind: 'error', reason: VOICE_ERROR.MICROPHONE });
    }
  }
  return {
    isSupported,
    state,
    start: () => void start(),
    stop: () => handle.current?.stop(),
    reset: () => setState(IDLE),
  };
}
