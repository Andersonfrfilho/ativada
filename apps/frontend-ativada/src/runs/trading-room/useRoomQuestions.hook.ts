// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useRef, useState } from 'react';

import { useAppConfig } from '../../app/useAppContext.hook.js';
import { BALCONY_AGENTS, type BalconySlot } from '../team-room/balcony/balcony.constant.js';
import type { QuestionEntry } from './question-entry.js';
import { useAskQuestionMutation, type AskInput } from './room-question.mutation.js';
import type { RoomQuestionAnswer } from './room-question.validation.js';
import {
  BUY_AT_OPTION,
  QUESTION_HISTORY_SIZE,
  ROOM_QUESTIONS,
  type RoomQuestionOption,
} from './room-questions.constant.js';
import {
  useTeamQuestions,
  type TeamQuestionsModel,
} from './team-question/useTeamQuestions.hook.js';

export type { QuestionEntry } from './question-entry.js';

export type RoomQuestions = {
  readonly symbols: readonly string[];
  readonly symbol: string;
  readonly setSymbol: (symbol: string) => void;
  // `onSymbol` vale para esta pergunta (a pergunta por voz escolhe a moeda junto); sem ele, a moeda escolhida.
  readonly ask: (option: RoomQuestionOption, onSymbol?: string) => void;
  // "E se eu comprar a X?": `price` em texto com ponto decimal; `shown` é como a pessoa o escreveu.
  readonly askBuyAt: (price: { readonly text: string; readonly shown: string }) => void;
  readonly isAsking: boolean;
  readonly hasFailed: boolean;
  // As últimas respostas (perguntas rápidas e livres), a mais nova primeiro.
  readonly history: readonly QuestionEntry[];
  // A resposta mais nova DESTA tela (a pergunta livre pedida aqui ou a rápida): é ela que vai ao telão e ao anúncio.
  readonly latest: QuestionEntry | undefined;
  // A pergunta livre às equipes ◆ ligadas.
  readonly team: TeamQuestionsModel;
};

function nameOf(slot: BalconySlot): string {
  return BALCONY_AGENTS.find((agent) => agent.slot === slot)?.name ?? slot;
}

type LocalEntry = QuestionEntry & { readonly isTracked: boolean };

// Rápidas e livres na mesma linha do tempo: a chave é o instante da resposta (a da rápida, o relógio daqui).
function mergeHistory(
  local: readonly LocalEntry[],
  team: readonly LocalEntry[],
): readonly LocalEntry[] {
  return [...local, ...team]
    .sort((left, right) => right.key - left.key)
    .slice(0, QUESTION_HISTORY_SIZE);
}

function toEntry(data: RoomQuestionAnswer, key: number, asked?: string): LocalEntry {
  const label = asked ?? ROOM_QUESTIONS.find((option) => option.key === data.question)?.label ?? '';
  return {
    key,
    who: data.agent,
    name: nameOf(data.agent),
    question: label,
    text: data.answer,
    symbol: data.symbol,
    isIndicative: data.basis === 'indicative',
    isTracked: true,
  };
}

// A caixa "Pergunte à equipe": a moeda escolhida (padrão: a da simulação, se habilitada), a pergunta em voo e o histórico.
export function useRoomQuestions(runId: string, runSymbol: string): RoomQuestions {
  const { marketSymbols } = useAppConfig();
  const fallback = marketSymbols.includes(runSymbol) ? runSymbol : (marketSymbols[0] ?? runSymbol);
  const [symbol, setSymbol] = useState(fallback);
  const [local, setLocal] = useState<readonly LocalEntry[]>([]);
  const lastKey = useRef(0);
  const mutation = useAskQuestionMutation(runId);
  const team = useTeamQuestions(runId);
  const history = mergeHistory(local, team.entries);
  function send(input: AskInput, asked?: string): void {
    mutation.mutate(input, {
      onSuccess: (data) => {
        lastKey.current = Math.max(Date.now(), lastKey.current + 1);
        const entry = toEntry(data, lastKey.current, asked);
        setLocal((before) => [entry, ...before].slice(0, QUESTION_HISTORY_SIZE));
      },
    });
  }
  function ask(option: RoomQuestionOption, onSymbol?: string): void {
    send({ symbol: onSymbol ?? symbol, question: option.key });
  }
  function askBuyAt(price: { readonly text: string; readonly shown: string }): void {
    send(
      { symbol, question: BUY_AT_OPTION.key, price: price.text },
      `E se eu comprar a ${price.shown} USDT?`,
    );
  }
  return {
    symbols: marketSymbols,
    symbol,
    setSymbol,
    ask,
    askBuyAt,
    isAsking: mutation.isPending,
    hasFailed: mutation.isError,
    history,
    latest: history[0]?.isTracked === true ? history[0] : undefined,
    team,
  };
}
