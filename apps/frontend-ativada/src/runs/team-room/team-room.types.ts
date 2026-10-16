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

export type TeamRoomView = {
  readonly candleTime: number;
  readonly closedAt: number;
  readonly specialists: readonly SpecialistView[];
  readonly analyst: AnalystView;
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
