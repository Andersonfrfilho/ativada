// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import controls from '../../../styles/Controls.module.css';
import type { VoiceQuestion } from './useVoiceQuestion.hook.js';
import { recordingLabel, VOICE_TEXT } from './voice-ask.constant.js';
import styles from './VoiceAsk.module.css';

export type MicButtonProps = { readonly voice: VoiceQuestion };

// Um botão só: toca para gravar, toca de novo para parar; enquanto transcreve fica desligado.
export function MicButton({ voice }: MicButtonProps): ReactElement {
  const { state } = voice;
  const isRecording = state.kind === 'recording';
  const label = isRecording
    ? recordingLabel(state.seconds)
    : state.kind === 'transcribing'
      ? VOICE_TEXT.TRANSCRIBING
      : VOICE_TEXT.START;
  return (
    <button
      type="button"
      className={`${controls.button} ${styles.mic} ${isRecording ? styles.recording : ''}`}
      aria-pressed={isRecording}
      disabled={state.kind === 'transcribing'}
      onClick={isRecording ? voice.stop : voice.start}
    >
      <span aria-hidden="true">🎙 </span>
      {label}
    </button>
  );
}
