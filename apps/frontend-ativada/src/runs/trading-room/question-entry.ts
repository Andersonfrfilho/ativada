// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AnswerRequest } from './office-answer.js';

// Uma resposta no histórico "Perguntas": de uma pergunta rápida (frase do servidor) ou de uma pergunta livre a uma equipe ◆.
export type QuestionEntry = AnswerRequest & {
  readonly name: string;
  readonly symbol: string;
  readonly isIndicative: boolean;
};
