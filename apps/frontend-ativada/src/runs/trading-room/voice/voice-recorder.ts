// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DEFAULT_AUDIO_TYPE } from './voice-ask.constant.js';

export type RecordingHandle = {
  // Termina a gravação e entrega o áudio.
  readonly stop: () => void;
  // Termina sem entregar nada (a tela saiu): o microfone é solto do mesmo jeito.
  readonly release: () => void;
};

export function isVoiceSupported(): boolean {
  if (typeof navigator === 'undefined' || typeof MediaRecorder === 'undefined') return false;
  return typeof navigator.mediaDevices?.getUserMedia === 'function';
}

function audioTypeOf(recorder: MediaRecorder): string {
  return recorder.mimeType === '' ? DEFAULT_AUDIO_TYPE : recorder.mimeType;
}

// Grava o microfone até `stop`; ao parar solta as faixas (a luz do microfone apaga) e entrega o áudio com o tipo do gravador.
export async function startRecording(onAudio: (audio: Blob) => void): Promise<RecordingHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  let isReleased = false;
  let areTracksStopped = false;
  const releaseTracks = (): void => {
    if (areTracksStopped) return;
    areTracksStopped = true;
    stream.getTracks().forEach((track) => track.stop());
  };
  const stopRecorder = (): void => {
    if (recorder.state !== 'inactive') recorder.stop();
  };
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  recorder.addEventListener('stop', () => {
    releaseTracks();
    if (!isReleased) onAudio(new Blob(chunks, { type: audioTypeOf(recorder) }));
  });
  recorder.start();
  return {
    stop: stopRecorder,
    release: (): void => {
      isReleased = true;
      stopRecorder();
      releaseTracks();
    },
  };
}
