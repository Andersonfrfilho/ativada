// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import type { RoomQuestions } from '../useRoomQuestions.hook.js';
import { HeardQuestion } from './HeardQuestion.component.js';
import { MicButton } from './MicButton.component.js';
import { useVoiceQuestion } from './useVoiceQuestion.hook.js';
import { VOICE_ERROR_TEXT, VOICE_TEXT } from './voice-ask.constant.js';
import styles from './VoiceAsk.module.css';

export type VoiceAskProps = { readonly questions: RoomQuestions };

// "Perguntar falando": só aparece quando o navegador grava áudio. A fala vira texto no servidor e uma pergunta rápida aqui.
export function VoiceAsk({ questions }: VoiceAskProps): ReactElement | null {
  const voice = useVoiceQuestion();
  if (!voice.isSupported) return null;
  const { state } = voice;
  return (
    <div className={styles.voice}>
      <MicButton voice={voice} />
      {state.kind === 'idle' ? <p className={styles.heard}>{VOICE_TEXT.PRIVACY}</p> : null}
      {state.kind === 'heard' ? (
        <HeardQuestion text={state.text} questions={questions} onDone={voice.reset} />
      ) : null}
      {state.kind === 'error' ? (
        <p className={styles.problem}>{VOICE_ERROR_TEXT[state.reason]}</p>
      ) : null}
    </div>
  );
}
