// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { BalconySlot } from '../team-room/balcony/balcony.constant.js';
import { chatStep, fadeSpeech, type ChatContext } from './office-chat.js';
import type { Point } from './office-geometry.js';
import type { AgentLife, LifeAction } from './office-life.types.js';

export type StepEffects = {
  // Fala do anfitrião de uma visita (aplicada depois que todos andaram).
  readonly replies: { readonly host: BalconySlot; readonly text: string }[];
  readonly released: BalconySlot[];
  // A máquina de café: quem a pegou e quem a soltou neste passo; `isMachineBusy` muda na ordem em que cada um anda.
  readonly claimed: BalconySlot[];
  readonly freed: BalconySlot[];
  readonly spills: Point[];
  isMachineBusy: boolean;
  readonly chat: ChatContext;
};

export const SPEECH_STEPS = 8;

function walkOne(
  agent: AgentLife,
  action: Extract<LifeAction, { kind: 'walk' }>,
  rest: readonly LifeAction[],
): AgentLife {
  const [next, ...others] = action.steps;
  if (next === undefined) return { ...agent, queue: rest };
  const face = next.x === agent.at.x ? agent.face : next.x < agent.at.x ? 'left' : 'right';
  const queue = others.length === 0 ? rest : [{ ...action, steps: others }, ...rest];
  return { ...agent, ...fadeSpeech(agent), at: next, pose: 'walking', face, queue };
}

function waitOne(
  agent: AgentLife,
  action: Extract<LifeAction, { kind: 'wait' }>,
  rest: readonly LifeAction[],
): AgentLife {
  const isFirst = action.say !== undefined;
  const speech = isFirst ? { speech: action.say, speechSteps: action.steps } : fadeSpeech(agent);
  const left = action.steps - 1;
  const queue =
    left > 0 ? [{ kind: 'wait' as const, steps: left, pose: action.pose }, ...rest] : rest;
  return {
    ...agent,
    ...speech,
    pose: action.pose,
    face: action.face ?? agent.face,
    hasCup: action.cup ?? agent.hasCup,
    queue,
  };
}

function awaitMachine(
  agent: AgentLife,
  rest: readonly LifeAction[],
  effects: StepEffects,
): AgentLife {
  if (effects.isMachineBusy) return { ...agent, ...fadeSpeech(agent), pose: 'standing' };
  effects.isMachineBusy = true;
  effects.claimed.push(agent.who);
  return advanceAgent({ ...agent, queue: rest }, effects);
}

// Um passo de um agente: anda um ladrilho, espera um passo, conversa, ou registra a fala do anfitrião, a saída do telão e a
// vez na máquina de café.
export function advanceAgent(agent: AgentLife, effects: StepEffects): AgentLife {
  const [action, ...rest] = agent.queue;
  if (action === undefined) return { ...agent, ...fadeSpeech(agent) };
  if (action.kind === 'walk') return walkOne(agent, action, rest);
  if (action.kind === 'wait') return waitOne(agent, action, rest);
  if (action.kind === 'chat') return chatStep({ agent, action, rest, context: effects.chat });
  if (action.kind === 'await_machine') return awaitMachine(agent, rest, effects);
  if (action.kind === 'spill') effects.spills.push(agent.at);
  else if (action.kind === 'reply') effects.replies.push({ host: action.host, text: action.text });
  else if (action.kind === 'free_machine') {
    effects.freed.push(agent.who);
    effects.isMachineBusy = false;
  } else effects.released.push(agent.who);
  return advanceAgent({ ...agent, queue: rest }, effects);
}
