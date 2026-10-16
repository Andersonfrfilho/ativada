// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState } from 'react';

import type { AnalystOptionProps } from './AnalystOption.component.js';
import {
  DEFAULT_SIMULATION_TIMEFRAME,
  SIMULATION_TIMEFRAME,
  type SimulationTimeframe,
} from './simulation-timeframe.constant.js';

export type SimulationChoice = {
  readonly timeframe: SimulationTimeframe;
  readonly setTimeframe: (timeframe: SimulationTimeframe) => void;
  readonly isAnalystOn: boolean;
  readonly analyst: AnalystOptionProps;
};

// A vela e o analista de risco juntos: o analista só existe com a vela de 15 min, então ligar trava a vela e desligar volta ao padrão.
export function useSimulationChoice(): SimulationChoice {
  const [timeframe, setTimeframe] = useState<SimulationTimeframe>(DEFAULT_SIMULATION_TIMEFRAME);
  const [isAnalystOn, setIsAnalystOn] = useState(false);
  return {
    timeframe,
    setTimeframe,
    isAnalystOn,
    analyst: {
      isOn: isAnalystOn,
      onChange: (isOn): void => {
        setIsAnalystOn(isOn);
        setTimeframe(isOn ? SIMULATION_TIMEFRAME.QUARTER_HOUR : DEFAULT_SIMULATION_TIMEFRAME);
      },
    },
  };
}
