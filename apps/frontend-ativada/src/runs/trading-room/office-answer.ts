// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { BalconySlot } from '../team-room/balcony/balcony.constant.js';
import { REST_FACING, restPose } from './office-activities.js';
import { screenSpotOf, seatOf } from './office-geometry.js';
import type { AgentLife, LifeAction, LifeAnswer, LifeState } from './office-life.types.js';

// Quanto tempo quem responde fica na frente do telão com o balão (em passos de `stepLife`).
export const ANSWER_STEPS = 28;

export type AnswerRequest = Omit<LifeAnswer, 'isScheduled'>;

function answerQueue(who: BalconySlot): readonly LifeAction[] {
  return [
    { kind: 'walk', to: screenSpotOf(who) },
    { kind: 'wait', steps: ANSWER_STEPS, pose: 'pointing', face: 'n', cup: false },
    { kind: 'release' },
    { kind: 'walk', to: seatOf(who) },
    { kind: 'wait', steps: 1, pose: restPose(who), face: REST_FACING },
  ];
}

function homeQueue(who: BalconySlot): readonly LifeAction[] {
  return [
    { kind: 'walk', to: seatOf(who) },
    { kind: 'wait', steps: 1, pose: restPose(who), face: REST_FACING, cup: false },
  ];
}

// A pergunta respondida: quem responde vai à frente do telão. Quem não está na sala (equipe de regra fora de uma execução de
// equipe) não responde no piso; a resposta fica só no histórico em texto.
export function startAnswer(state: LifeState, request: AnswerRequest): LifeState {
  if (!state.agents.some((agent) => agent.who === request.who)) return state;
  const answer: LifeAnswer = { ...request, isScheduled: false };
  return { ...state, answer };
}

function routeAgent(
  agent: AgentLife,
  params: { answer: LifeAnswer; holder: BalconySlot | undefined },
): AgentLife {
  if (agent.who === params.answer.who) {
    return { ...agent, speech: undefined, speechSteps: 0, queue: answerQueue(agent.who) };
  }
  // O telão é de um por vez: quem estava nele cede a vez e volta à mesa.
  return agent.who === params.holder ? { ...agent, queue: homeQueue(agent.who) } : agent;
}

// Fora da reunião, a resposta pendente vira a fila de quem responde (anda pelo caminho e pelo trânsito de sempre). Se ele
// segurava a máquina de café, a solta.
export function scheduleAnswer(state: LifeState): LifeState {
  const { answer } = state;
  if (answer === undefined || answer.isScheduled || state.meeting !== undefined) return state;
  const holder = state.screenHolder;
  const agents = state.agents.map((agent) => routeAgent(agent, { answer, holder }));
  const machineHolder = state.machineHolder === answer.who ? undefined : state.machineHolder;
  return {
    ...state,
    agents,
    screenHolder: answer.who,
    machineHolder,
    answer: { ...answer, isScheduled: true },
  };
}

// Quem responde agora no balão grande: só depois de chegar e apontar para o telão.
export function answerOf(
  state: LifeState,
  speaker: BalconySlot | undefined,
): LifeAnswer | undefined {
  const { answer } = state;
  return answer?.isScheduled === true && answer.who === speaker ? answer : undefined;
}

// Saiu do telão: a resposta acaba (o histórico em texto continua com ela).
export function settleAnswer(
  state: LifeState,
  released: readonly BalconySlot[],
): LifeState['answer'] {
  const { answer } = state;
  if (answer === undefined || !answer.isScheduled) return answer;
  return released.includes(answer.who) ? undefined : answer;
}
