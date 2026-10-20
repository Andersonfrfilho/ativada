// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseScaled } from '../../format/decimal.js';

// A parede de telas da sala: só desenho e formatação do que o servidor e os dados de preço já trazem.
export const WORLD_CLOCKS = [
  { city: 'Nova York', zone: 'America/New_York' },
  { city: 'Londres', zone: 'Europe/London' },
  { city: 'Tóquio', zone: 'Asia/Tokyo' },
  { city: 'São Paulo', zone: 'America/Sao_Paulo' },
] as const;

export type Pip = {
  readonly value: number;
  readonly side: 'buy' | 'sell' | 'zero';
  readonly isOn: boolean;
  readonly isGate: boolean;
};

const PIP_RANGE = 4;
const SCALE = 100_000_000n;

// As casas do placar de −4 a +4: acesas até o placar (comparação exata em BigInt), com a marca do limiar de compra e venda.
export function scorePips(score: string, threshold: string): readonly Pip[] {
  const scaled = parseScaled(score) ?? 0n;
  const gate = parseScaled(threshold);
  return Array.from({ length: PIP_RANGE * 2 + 1 }, (_, index): Pip => {
    const value = index - PIP_RANGE;
    const position = BigInt(value) * SCALE;
    const isOn = value > 0 ? position <= scaled : value < 0 && position >= scaled;
    const isGate = gate !== undefined && (position === gate || position === -gate);
    return { value, side: value > 0 ? 'buy' : value < 0 ? 'sell' : 'zero', isOn, isGate };
  });
}

export type GaugeNeedle = { readonly x: number; readonly y: number };
const GAUGE = { cx: 60, cy: 56, needle: 44 } as const;

// A ponta do ponteiro do Fear & Greed (0 = medo extremo à esquerda, 100 = ganância extrema à direita). Desenho.
export function gaugeNeedle(value: number): GaugeNeedle {
  const angle = Math.PI - (value / 100) * Math.PI;
  return {
    x: GAUGE.cx + GAUGE.needle * Math.cos(angle),
    y: GAUGE.cy - GAUGE.needle * Math.sin(angle),
  };
}

export function gaugeArc(zone: number): string {
  const radius = 50;
  const from = Math.PI - (zone / 5) * Math.PI;
  const to = Math.PI - ((zone + 1) / 5) * Math.PI;
  const point = (angle: number): string =>
    `${GAUGE.cx + radius * Math.cos(angle)} ${GAUGE.cy - radius * Math.sin(angle)}`;
  return `M${point(from)}A${radius} ${radius} 0 0 1 ${point(to)}`;
}

// Intensidade do mapa de calor pela variação de 24 h (fração): 1 até 1,2%, 2 até 2,4%, 3 acima.
export function heatLevel(change: number): 1 | 2 | 3 {
  const percent = Math.abs(change) * 100;
  if (percent <= 1.2) return 1;
  return percent <= 2.4 ? 2 : 3;
}

export function clockText(now: number, zone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
}
