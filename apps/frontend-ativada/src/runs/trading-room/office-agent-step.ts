// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { BalconySlot } from '../team-room/balcony/balcony.constant.js';
import { chatStep, fadeSpeech, type ChatContext } from './office-chat.js';
import type { Point } from './office-grid.js';
import type { AgentLife, LifeAction } from './office-life.types.js';
import type { Traffic } from './office-traffic.js';
import { walkStep } from './office-walk.js';

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
  readonly traffic: Traffic;
};

export const SPEECH_STEPS = 8;

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
  effects.traffic.machineHolder = agent.who;
  return advanceAgent({ ...agent, queue: rest }, effects);
}

function instant(action: LifeAction, agent: AgentLife, effects: StepEffects): void {
  if (action.kind === 'spill') effects.spills.push(agent.at);
  else if (action.kind === 'reply') effects.replies.push({ host: action.host, text: action.text });
  else if (action.kind === 'free_machine') {
    effects.freed.push(agent.who);
    effects.isMachineBusy = false;
    effects.traffic.machineHolder = undefined;
  } else if (action.kind === 'release') effects.released.push(agent.who);
}

// Um passo de um agente: anda um ladrilho, espera um passo, conversa, ou registra a fala do anfitrião, a saída do telão e a
// vez na máquina de café.
export function advanceAgent(agent: AgentLife, effects: StepEffects): AgentLife {
  const [action, ...rest] = agent.queue;
  if (action === undefined) return { ...agent, ...fadeSpeech(agent) };
  if (action.kind === 'walk') {
    const walked = walkStep({ agent, action, rest, traffic: effects.traffic });
    return walked ?? advanceAgent({ ...agent, queue: rest }, effects);
  }
  if (action.kind === 'wait') return waitOne(agent, action, rest);
  if (action.kind === 'chat') return chatStep({ agent, action, rest, context: effects.chat });
  if (action.kind === 'await_machine') return awaitMachine(agent, rest, effects);
  instant(action, agent, effects);
  return advanceAgent({ ...agent, queue: rest }, effects);
}
