// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState } from 'react';

import type { AnalystOptionProps } from './AnalystOption.component.js';
import {
  ANALYST_MODE,
  DEFAULT_SIMULATION_TIMEFRAME,
  SIMULATION_TIMEFRAME,
  type AnalystMode,
  type SimulationTimeframe,
} from './simulation-timeframe.constant.js';

export type SimulationChoice = {
  readonly timeframe: SimulationTimeframe;
  readonly setTimeframe: (timeframe: SimulationTimeframe) => void;
  // `undefined` sem analista; com ele, o modo escolhido (o padrão é a sombra).
  readonly analystMode: AnalystMode | undefined;
  readonly analyst: AnalystOptionProps;
};

// A vela e o analista de risco juntos: o analista só existe com a vela de 15 min, então ligar trava a vela e desligar volta ao padrão.
export function useSimulationChoice(): SimulationChoice {
  const [timeframe, setTimeframe] = useState<SimulationTimeframe>(DEFAULT_SIMULATION_TIMEFRAME);
  const [isAnalystOn, setIsAnalystOn] = useState(false);
  const [mode, setMode] = useState<AnalystMode>(ANALYST_MODE.SHADOW);
  return {
    timeframe,
    setTimeframe,
    analystMode: isAnalystOn ? mode : undefined,
    analyst: {
      isOn: isAnalystOn,
      mode,
      onModeChange: setMode,
      onChange: (isOn): void => {
        setIsAnalystOn(isOn);
        setTimeframe(isOn ? SIMULATION_TIMEFRAME.QUARTER_HOUR : DEFAULT_SIMULATION_TIMEFRAME);
      },
    },
  };
}
