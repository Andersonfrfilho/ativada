// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { BalconySlot } from '../team-room/balcony/balcony.constant.js';
import type { AgentLife, LifeAction } from './office-life.types.js';

export type StepEffects = {
  // Fala do anfitrião de uma visita (aplicada depois que todos andaram).
  readonly replies: { readonly host: BalconySlot; readonly text: string }[];
  readonly released: BalconySlot[];
};

export const SPEECH_STEPS = 8;

function withSpeech(agent: AgentLife): Pick<AgentLife, 'speech' | 'speechSteps'> {
  const left = agent.speechSteps - 1;
  return left > 0
    ? { speech: agent.speech, speechSteps: left }
    : { speech: undefined, speechSteps: 0 };
}

function walkOne(
  agent: AgentLife,
  action: Extract<LifeAction, { kind: 'walk' }>,
  rest: readonly LifeAction[],
): AgentLife {
  const [next, ...others] = action.steps;
  if (next === undefined) return { ...agent, queue: rest };
  const face = next.x === agent.at.x ? agent.face : next.x < agent.at.x ? 'left' : 'right';
  const queue = others.length === 0 ? rest : [{ ...action, steps: others }, ...rest];
  return { ...agent, ...withSpeech(agent), at: next, pose: 'walking', face, queue };
}

function waitOne(
  agent: AgentLife,
  action: Extract<LifeAction, { kind: 'wait' }>,
  rest: readonly LifeAction[],
): AgentLife {
  const isFirst = action.say !== undefined;
  const speech = isFirst ? { speech: action.say, speechSteps: action.steps } : withSpeech(agent);
  const left = action.steps - 1;
  const queue =
    left > 0 ? [{ kind: 'wait' as const, steps: left, pose: action.pose }, ...rest] : rest;
  return { ...agent, ...speech, pose: action.pose, queue };
}

// Um passo de um agente: anda um ladrilho, espera um passo, ou registra a fala do anfitrião e a saída do telão.
export function advanceAgent(agent: AgentLife, effects: StepEffects): AgentLife {
  const [action, ...rest] = agent.queue;
  if (action === undefined) return { ...agent, ...withSpeech(agent) };
  if (action.kind === 'walk') return walkOne(agent, action, rest);
  if (action.kind === 'wait') return waitOne(agent, action, rest);
  if (action.kind === 'reply') effects.replies.push({ host: action.host, text: action.text });
  else effects.released.push(agent.who);
  return advanceAgent({ ...agent, queue: rest }, effects);
}
