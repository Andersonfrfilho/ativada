// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState } from 'react';

export type ItemHandlers = {
  readonly onFocus: () => void;
  readonly onBlur: () => void;
  readonly onMouseEnter: () => void;
  readonly onMouseLeave: () => void;
};

export type ActiveChartItem = {
  readonly activeKey: string | undefined;
  // O último item que teve foco: é a única parada de Tab do gráfico (tabindex de passagem).
  readonly rovingKey: string | undefined;
  readonly bind: (key: string) => ItemHandlers;
  readonly dismiss: () => void;
};

// A dica segue o ponteiro (se há um) e senão o foco; `Esc` fecha até o próximo foco ou passada do mouse.
export function useActiveChartItem(): ActiveChartItem {
  const [focusedKey, setFocusedKey] = useState<string | undefined>(undefined);
  const [hoveredKey, setHoveredKey] = useState<string | undefined>(undefined);
  const [rovingKey, setRovingKey] = useState<string | undefined>(undefined);
  const [isDismissed, setIsDismissed] = useState(false);
  return {
    activeKey: isDismissed ? undefined : (hoveredKey ?? focusedKey),
    rovingKey,
    dismiss: (): void => setIsDismissed(true),
    bind: (key): ItemHandlers => ({
      onFocus: (): void => {
        setFocusedKey(key);
        setRovingKey(key);
        setIsDismissed(false);
      },
      onBlur: (): void => setFocusedKey(undefined),
      onMouseEnter: (): void => {
        setHoveredKey(key);
        setIsDismissed(false);
      },
      onMouseLeave: (): void => setHoveredKey(undefined),
    }),
  };
}
