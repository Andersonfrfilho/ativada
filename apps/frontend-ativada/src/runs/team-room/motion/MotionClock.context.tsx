// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createContext, useContext, type ReactElement, type ReactNode } from 'react';

import { REAL_TIMER, type MotionTimer } from './cue-runner.js';

const MotionClockContext = createContext<MotionTimer>(REAL_TIMER);

// O relógio das cenas de movimento (varanda e escritório). O padrão é o real; o contrato entrega um falso para andar o tempo.
export function MotionClockProvider({
  timer,
  children,
}: {
  readonly timer: MotionTimer;
  readonly children: ReactNode;
}): ReactElement {
  return <MotionClockContext.Provider value={timer}>{children}</MotionClockContext.Provider>;
}

export function useMotionTimer(): MotionTimer {
  return useContext(MotionClockContext);
}
