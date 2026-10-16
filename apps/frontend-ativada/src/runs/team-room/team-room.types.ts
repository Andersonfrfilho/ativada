// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ChipTone } from '../live-tracking/StatusChip.component.js';
import type { IconName } from '../../layout/Icon.component.js';
import type { TeamFamily } from './team-room.constant.js';

export type VoteKind = 'favor' | 'against' | 'neutral' | 'unread';

export type SeatLook = {
  readonly tone: ChipTone;
  readonly icon: IconName;
  readonly word: string;
};

// `voter` votou e conta no placar; `quiet` não conta nesta vela (peso zero ou sem dado); `normal` conta mas ficou neutra.
export type SeatTone = 'voter' | 'normal' | 'quiet';

export type RuleLine = {
  readonly ruleId: string;
  // O tipo da regra no motor (rsi, bollinger, ema_cross...); a varanda o usa para ligar a leitura ao termo do glossário.
  readonly kind?: string;
  readonly label: string;
  readonly voteKind: VoteKind;
  readonly weightText: string;
  readonly isCounted: boolean;
  // A frase do servidor para a regra (só na vela mais recente) e a leitura gravada na decisão.
  readonly motive: string | undefined;
  readonly reading: string | undefined;
};

export type SpecialistView = {
  readonly family: TeamFamily;
  readonly name: string;
  readonly tone: SeatTone;
  readonly rules: readonly RuleLine[];
  readonly placard: string;
};

export type AnalystView = {
  readonly name: string;
  readonly outcome: SeatLook;
  readonly scoreText: string;
  readonly message: string;
};

// O analista de risco de verdade (spec 007): a postura em ícone + palavra + cor e só frases do servidor.
export type RiskAnalystView = {
  readonly name: string;
  readonly look: SeatLook;
  readonly lines: readonly string[];
  readonly isShadow: boolean;
};

export type TeamRoomView = {
  readonly candleTime: number;
  readonly closedAt: number;
  readonly specialists: readonly SpecialistView[];
  readonly analyst: AnalystView;
  // Presente só quando a simulação tem analista: ele toma o lugar do resumo do placar da estratégia.
  readonly riskAnalyst: RiskAnalystView | undefined;
  readonly hasOpinion: boolean;
};

export type AuditorView = {
  readonly look: SeatLook;
  readonly lead: string;
  readonly rateText: string;
  readonly coinText: string;
  readonly intervalText: string | undefined;
  readonly verdictMessage: string;
};
