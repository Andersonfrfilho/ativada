// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { MotionTimer } from '../../src/runs/team-room/motion/cue-runner.js';

export type FakeMotionTimer = {
  readonly timer: MotionTimer;
  // Anda o tempo; cada temporizador vencido roda na ordem, e os que ele agenda dentro da janela também.
  readonly advance: (milliseconds: number) => void;
  // Quantos temporizadores estão pendentes (a cena tem no máximo um).
  readonly pending: () => number;
};

type Task = { at: number; callback: () => void };

export function createFakeMotionTimer(): FakeMotionTimer {
  let now = 0;
  let tasks: Task[] = [];
  const timer: MotionTimer = (callback, milliseconds) => {
    const task: Task = { at: now + milliseconds, callback };
    tasks.push(task);
    return (): void => {
      tasks = tasks.filter((item) => item !== task);
    };
  };
  function advance(milliseconds: number): void {
    const end = now + milliseconds;
    for (;;) {
      const due = tasks.filter((task) => task.at <= end).sort((a, b) => a.at - b.at)[0];
      if (due === undefined) break;
      tasks = tasks.filter((task) => task !== due);
      now = due.at;
      due.callback();
    }
    now = end;
  }
  return { timer, advance, pending: () => tasks.length };
}
