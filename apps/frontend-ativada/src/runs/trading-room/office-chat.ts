// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { BalconySlot } from '../team-room/balcony/balcony.constant.js';
import type { AgentLife, LifeAction, LifeState } from './office-life.types.js';

// Conversa de café: frases curtas e casuais, sem nada que pareça conselho de investimento.
export const CHAT_LINES = [
  'Café forte hoje.',
  'O mercado acordou cedo.',
  'Mais um gole e volto pro placar.',
  'Esse café salvou a manhã.',
  'Hoje o telão está animado.',
  'Vale um segundo café.',
] as const;
export const CHAT_TURN_STEPS = 4;

export type ChatContext = {
  readonly tick: number;
  readonly seed: number;
  // Quem está conversando agora (parado num ponto do café, com a conversa na frente da fila).
  readonly talkers: readonly AgentLife[];
  // Quem ainda vem para o café (na fila da máquina, usando-a ou a caminho da conversa).
  readonly arriving: readonly BalconySlot[];
};

export function fadeSpeech(agent: AgentLife): Pick<AgentLife, 'speech' | 'speechSteps'> {
  const left = agent.speechSteps - 1;
  return left > 0
    ? { speech: agent.speech, speechSteps: left }
    : { speech: undefined, speechSteps: 0 };
}

export function chatContextOf(state: LifeState): ChatContext {
  const isComing = (agent: AgentLife): boolean =>
    agent.queue.some((action) => action.kind === 'await_machine' || action.kind === 'chat');
  const talkers = state.agents.filter((agent) => agent.queue[0]?.kind === 'chat');
  const arriving = state.agents.filter(isComing).map((agent) => agent.who);
  if (state.machineHolder !== undefined) arriving.push(state.machineHolder);
  return { tick: state.tick, seed: state.seed, talkers, arriving };
}

function speakIn(agent: AgentLife, partner: AgentLife, context: ChatContext): Partial<AgentLife> {
  const turn = Math.floor(context.tick / CHAT_TURN_STEPS);
  const isMyTurn = turn % 2 === (agent.who < partner.who ? 0 : 1);
  if (!isMyTurn || context.tick % CHAT_TURN_STEPS !== 0) return fadeSpeech(agent);
  return {
    speech: CHAT_LINES[(context.seed + turn) % CHAT_LINES.length],
    speechSteps: CHAT_TURN_STEPS,
  };
}

// Um passo da conversa: com um colega também em conversa, os dois se olham e falam um de cada vez; sozinho, só espera
// enquanto alguém ainda vem para o café.
export function chatStep(params: {
  readonly agent: AgentLife;
  readonly action: Extract<LifeAction, { kind: 'chat' }>;
  readonly rest: readonly LifeAction[];
  readonly context: ChatContext;
}): AgentLife {
  const { agent, action, rest, context } = params;
  const left = action.steps - 1;
  const queue = left > 0 ? [{ ...action, steps: left }, ...rest] : rest;
  const partner = context.talkers.find((other) => other.who !== agent.who);
  if (partner === undefined) {
    const isWaiting = context.arriving.some((who) => who !== agent.who);
    return { ...agent, ...fadeSpeech(agent), pose: 'holding', queue: isWaiting ? queue : rest };
  }
  const face = partner.at.x < agent.at.x ? 'left' : 'right';
  return { ...agent, ...speakIn(agent, partner, context), pose: 'holding', face, queue };
}
