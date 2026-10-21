// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { BalconySlot } from '../team-room/balcony/balcony.constant.js';
import { createRandom } from '../team-room/motion/seeded-random.js';
import { chatContextOf } from './office-chat.js';
import { planActivity, REST_FACING, restPose } from './office-activities.js';
import { scheduleAnswer, settleAnswer } from './office-answer.js';
import { advanceAgent, SPEECH_STEPS, type StepEffects } from './office-agent-step.js';
import { gatherSpot, seatOf, type Point } from './office-geometry.js';
import type { AgentLife, LifeLine, LifeState } from './office-life.types.js';
import { floorMaskOf } from './office-mask.js';
import { createTraffic, priorityOrder } from './office-traffic.js';

// A vida no escritório como dado puro: `stepLife` avança UM passo de todos (um ladrilho ou uma pausa), sorteando a próxima
// atividade com a semente do passo. A mesma semente dá sempre a mesma sequência; nenhum relógio aqui.
export const STEP_MILLISECONDS = 320;
export const BANNER_STEPS = 16;
const SEED_STRIDE = 7_919;

export function createLife(params: {
  readonly crew: readonly BalconySlot[];
  readonly seed: number;
  readonly lines: LifeState['lines'];
}): LifeState {
  const agents = params.crew.map((who): AgentLife => ({
    who,
    at: seatOf(who),
    pose: restPose(who),
    face: REST_FACING,
    hasCup: false,
    stride: 0,
    queue: [],
    speech: undefined,
    speechSteps: 0,
  }));
  return {
    tick: 0,
    seed: params.seed,
    agents,
    screenHolder: undefined,
    machineHolder: undefined,
    puddle: undefined,
    meeting: undefined,
    lines: params.lines,
    answer: undefined,
  };
}

export function withLines(
  state: LifeState,
  lines: Readonly<Partial<Record<BalconySlot, LifeLine>>>,
): LifeState {
  return { ...state, lines };
}

// A reunião da vela nova: todos andam até a frente do telão, a faixa aparece e cada um volta ao assento.
export function startMeeting(state: LifeState): LifeState {
  const total = state.agents.length;
  const agents = state.agents.map((agent, index) => ({
    ...agent,
    speech: undefined,
    speechSteps: 0,
    hasCup: false,
    queue: [
      { kind: 'walk' as const, to: gatherSpot(index, total) },
      { kind: 'wait' as const, steps: 1, pose: 'standing' as const, face: 'n' as const },
    ],
  }));
  return {
    ...state,
    agents,
    screenHolder: undefined,
    machineHolder: undefined,
    meeting: { phase: 'gathering', bannerSteps: 0 },
    // A reunião passa na frente; a resposta volta a ser agendada quando ela acabar.
    answer: state.answer === undefined ? undefined : { ...state.answer, isScheduled: false },
  };
}

function sendHome(agents: readonly AgentLife[]): readonly AgentLife[] {
  return agents.map((agent) => ({
    ...agent,
    queue: [
      { kind: 'walk' as const, to: seatOf(agent.who) },
      { kind: 'wait' as const, steps: 1, pose: restPose(agent.who), face: REST_FACING },
    ],
  }));
}

function advanceMeeting(state: LifeState): LifeState {
  const { meeting } = state;
  if (meeting === undefined) return state;
  const isIdle = state.agents.every((agent) => agent.queue.length === 0);
  if (meeting.phase === 'gathering' && isIdle) {
    const agents = state.agents.map((agent) => ({
      ...agent,
      pose: agent.who === 'alice' ? ('pointing' as const) : ('standing' as const),
      face: 'n' as const,
    }));
    return { ...state, agents, meeting: { phase: 'banner', bannerSteps: BANNER_STEPS } };
  }
  if (meeting.phase === 'banner') {
    const left = meeting.bannerSteps - 1;
    if (left > 0) return { ...state, meeting: { phase: 'banner', bannerSteps: left } };
    return {
      ...state,
      agents: sendHome(state.agents),
      meeting: { phase: 'returning', bannerSteps: 0 },
    };
  }
  return meeting.phase === 'returning' && isIdle ? { ...state, meeting: undefined } : state;
}

function planIdle(state: LifeState): LifeState {
  if (state.meeting !== undefined) return state;
  const random = createRandom(state.seed + state.tick * SEED_STRIDE);
  let holder = state.screenHolder;
  const agents = state.agents.map((agent) => {
    if (agent.queue.length > 0) return agent;
    const queue = planActivity(agent, { ...state, screenHolder: holder }, random);
    if (queue.some((action) => action.kind === 'release')) holder = agent.who;
    return { ...agent, queue };
  });
  return { ...state, agents, screenHolder: holder };
}

export const PUDDLE_STEPS = 12;

function puddleAfter(puddle: LifeState['puddle'], spill: Point | undefined): LifeState['puddle'] {
  if (spill !== undefined) return { at: spill, steps: PUDDLE_STEPS };
  if (puddle === undefined || puddle.steps <= 1) return undefined;
  return { at: puddle.at, steps: puddle.steps - 1 };
}

function applyEffects(state: LifeState, effects: StepEffects): LifeState {
  const agents = state.agents.map((agent) => {
    const reply = effects.replies.find((item) => item.host === agent.who);
    return reply === undefined
      ? agent
      : { ...agent, speech: reply.text, speechSteps: SPEECH_STEPS };
  });
  const isReleased =
    state.screenHolder !== undefined && effects.released.includes(state.screenHolder);
  return {
    ...state,
    agents,
    screenHolder: isReleased ? undefined : state.screenHolder,
    machineHolder: effects.traffic.machineHolder,
    puddle: puddleAfter(state.puddle, effects.spills[0]),
    answer: settleAnswer(state, effects.released),
  };
}

export function stepLife(state: LifeState): LifeState {
  const planned = planIdle(scheduleAnswer(advanceMeeting(state)));
  const traffic = createTraffic({
    mask: floorMaskOf(planned.agents.map((agent) => agent.who)),
    machineHolder: planned.machineHolder,
    agents: planned.agents,
  });
  const effects: StepEffects = {
    replies: [],
    released: [],
    claimed: [],
    freed: [],
    spills: [],
    isMachineBusy: planned.machineHolder !== undefined,
    chat: chatContextOf(planned),
    traffic,
  };
  const agents = [...planned.agents];
  for (const index of priorityOrder(planned.agents, planned.seed)) {
    const agent = agents[index];
    if (agent !== undefined) agents[index] = advanceAgent(agent, effects);
  }
  return applyEffects({ ...planned, tick: planned.tick + 1, agents }, effects);
}

// Quem fala no telão agora: o dono do telão quando já está apontando.
export function speakerOf(state: LifeState): BalconySlot | undefined {
  const holder = state.agents.find((agent) => agent.who === state.screenHolder);
  return holder?.pose === 'pointing' ? holder.who : undefined;
}
