// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useRef, useState } from 'react';

import { useAppConfig } from '../../app/useAppContext.hook.js';
import { BALCONY_AGENTS, type BalconySlot } from '../team-room/balcony/balcony.constant.js';
import type { AnswerRequest } from './office-answer.js';
import { useAskQuestionMutation } from './room-question.mutation.js';
import type { RoomQuestionAnswer } from './room-question.validation.js';
import {
  QUESTION_HISTORY_SIZE,
  ROOM_QUESTIONS,
  type RoomQuestionOption,
} from './room-questions.constant.js';

export type QuestionEntry = AnswerRequest & {
  readonly name: string;
  readonly symbol: string;
  readonly isIndicative: boolean;
};

export type RoomQuestions = {
  readonly symbols: readonly string[];
  readonly symbol: string;
  readonly setSymbol: (symbol: string) => void;
  // `onSymbol` vale para esta pergunta (a pergunta por voz escolhe a moeda junto); sem ele, a moeda escolhida.
  readonly ask: (option: RoomQuestionOption, onSymbol?: string) => void;
  readonly isAsking: boolean;
  readonly hasFailed: boolean;
  // As últimas respostas, a mais nova primeiro.
  readonly history: readonly QuestionEntry[];
};

function nameOf(slot: BalconySlot): string {
  return BALCONY_AGENTS.find((agent) => agent.slot === slot)?.name ?? slot;
}

function toEntry(data: RoomQuestionAnswer, key: number): QuestionEntry {
  const label = ROOM_QUESTIONS.find((option) => option.key === data.question)?.label ?? '';
  return {
    key,
    who: data.agent,
    name: nameOf(data.agent),
    question: label,
    text: data.answer,
    symbol: data.symbol,
    isIndicative: data.basis === 'indicative',
  };
}

// A caixa "Pergunte à equipe": a moeda escolhida (padrão: a da simulação, se habilitada), a pergunta em voo e o histórico.
export function useRoomQuestions(runId: string, runSymbol: string): RoomQuestions {
  const { marketSymbols } = useAppConfig();
  const fallback = marketSymbols.includes(runSymbol) ? runSymbol : (marketSymbols[0] ?? runSymbol);
  const [symbol, setSymbol] = useState(fallback);
  const [history, setHistory] = useState<readonly QuestionEntry[]>([]);
  const counter = useRef(0);
  const mutation = useAskQuestionMutation(runId);
  function ask(option: RoomQuestionOption, onSymbol?: string): void {
    mutation.mutate(
      { symbol: onSymbol ?? symbol, question: option.key },
      {
        onSuccess: (data) => {
          counter.current += 1;
          const entry = toEntry(data, counter.current);
          setHistory((before) => [entry, ...before].slice(0, QUESTION_HISTORY_SIZE));
        },
      },
    );
  }
  return {
    symbols: marketSymbols,
    symbol,
    setSymbol,
    ask,
    isAsking: mutation.isPending,
    hasFailed: mutation.isError,
    history,
  };
}
