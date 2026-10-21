// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState } from 'react';

import type { TIMEFRAMES } from '../run.constant.js';
import type { DisplayTimeframe } from './candle-chart.constant.js';
import { useCarriedTimeframe } from './CarriedTimeframe.context.js';

export type TimeframeChoice = (typeof TIMEFRAMES)[number] | DisplayTimeframe;

// A escolha vale só para esta execução e esta tela: nada vai ao armazenamento (RF05).
type Choice = { readonly owner: string; readonly timeframe: TimeframeChoice };

export type TimeframeChoiceInput = {
  readonly owner: string;
  readonly runTimeframe: string;
  readonly offered: readonly TimeframeChoice[];
  // A vela com que a execução abre quando a pessoa não escolheu (a de exibição das simulações ao vivo de 15 min).
  readonly preferred?: TimeframeChoice | undefined;
};

export type TimeframeChoiceState = {
  readonly timeframe: string;
  readonly choose: (next: TimeframeChoice) => void;
  readonly clear: () => void;
};

// A vela mostrada: a escolhida nesta execução, a levada da execução anterior pela troca rápida (se o ambiente a oferece),
// a preferida da execução (3 min ao vivo) ou a da própria execução.
export function useTimeframeChoice(input: TimeframeChoiceInput): TimeframeChoiceState {
  const { owner, runTimeframe, offered, preferred } = input;
  const carried = useCarriedTimeframe();
  const [choice, setChoice] = useState<Choice | undefined>(undefined);
  const carriedOffer = offered.find((option) => option === carried.timeframe);
  const preferredOffer = offered.find((option) => option === preferred);
  const fallback = carriedOffer ?? preferredOffer ?? runTimeframe;
  const timeframe = choice?.owner === owner ? choice.timeframe : fallback;
  return {
    timeframe,
    choose: (next): void => {
      setChoice({ owner, timeframe: next });
      carried.carry(next);
    },
    clear: (): void => {
      setChoice(undefined);
      carried.carry(undefined);
    },
  };
}
