// Copyright (c) 2026 Ada Technology. All rights reserved.

// Um tick JÁ agregado (no máximo um por segundo por par), com a variação de 24 h já calculada em decimal exato.
export type AggregatedTick = {
  readonly symbol: string;
  readonly price: string;
  readonly change24h: string | undefined;
  readonly eventTime: number;
};

// Ponto de extensão da Fase 4b (T4b.7): o alerta de preço é avaliado no tick agregado. Quem o implementa recebe CADA tick
// agregado uma vez; a falha de um ouvinte nunca derruba os outros nem o stream.
export type PriceTickListener = {
  readonly onTick: (tick: AggregatedTick) => void | Promise<void>;
};
