// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SignalDecision } from '@ativada/strategy-engine';

import type { TeamSignal } from './team-signal.js';

// D9 passo 3: do sinal REAL do `signalStep` da `model-team-1` ficam o que a carteira confere (`configHash`, lacuna, vela) e
// os indicadores (o ATR do risco); troca-se a decisão pela da equipe. `votes` fica vazio: os papéis moram no relatório.
export function applyTeamSignal(base: SignalDecision, team: TeamSignal): SignalDecision {
  return { ...base, action: team.action, score: team.score, votes: [], reason: team.reason };
}

// Sonda de posição: o mesmo sinal como espera, para a carteira dizer se há posição depois das execuções de `t`.
export function toHoldProbe(base: SignalDecision): SignalDecision {
  return { ...base, action: 'HOLD', score: '0', votes: [], reason: '' };
}
