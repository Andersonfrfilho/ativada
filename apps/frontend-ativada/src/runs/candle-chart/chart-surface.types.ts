// Copyright (c) 2026 Ada Technology. All rights reserved.

// Porta do gráfico de velas (spec 009, plan D1): o React só fala com ela. O adaptador real (`lightweight-surface.ts`,
// T3.1) é o ÚNICO arquivo que importa `lightweight-charts`; os contratos usam a superfície falsa de `test/support/`,
// porque o happy-dom não tem canvas. Tempo em segundos UTC e preço em `number`: só coordenada de desenho (RNF03).

export type SurfaceTime = number;

export type SurfaceCandle = {
  readonly time: SurfaceTime;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
};

export type SurfaceVolumeBar = {
  readonly time: SurfaceTime;
  readonly value: number;
  readonly isUp: boolean;
};

export type SurfaceLineRole =
  | 'channel_upper'
  | 'channel_lower'
  | 'ema_fast'
  | 'ema_slow'
  | 'band_upper'
  | 'band_middle'
  | 'band_lower';

export type SurfaceLine = {
  readonly key: string;
  readonly role: SurfaceLineRole;
  readonly points: readonly { readonly time: SurfaceTime; readonly value: number }[];
};

export type SurfaceScoreBar = {
  readonly time: SurfaceTime;
  readonly value: number;
  readonly action: 'BUY' | 'SELL' | 'HOLD';
};

export type SurfaceThreshold = {
  readonly from: SurfaceTime;
  readonly to: SurfaceTime;
  readonly buy: number;
  readonly sell: number;
};

export type SurfaceMarker = {
  readonly key: string;
  readonly time: SurfaceTime;
  readonly side: 'buy' | 'sell';
  readonly label: string;
  // O preço do preenchimento: o ponto exato onde o marcador pousa (desenho) e o texto da etiqueta.
  readonly price: number;
  readonly priceText: string;
  readonly isSelected: boolean;
  // Saída decidida dentro de uma vela da execução (alvo, proteção, lacuna): a abertura da ÚLTIMA vela de exibição dela; o colchete
  // cobre da marca até aqui (spec 017, D4-A).
  readonly endTime?: SurfaceTime | undefined;
};

// Níveis da estratégia desenhados como linha horizontal rotulada (camada "Níveis"); o texto da etiqueta vem pronto.
export type SurfacePriceLevel = {
  readonly key: string;
  readonly role: 'entry' | 'target' | 'stop' | 'trigger';
  readonly price: number;
  readonly title: string;
};

// Faixa de preço sombreada (compra, venda ou proteção): da mínima à máxima, na largura do gráfico, com o texto pronto.
export type SurfaceZone = {
  readonly key: string;
  readonly kind: 'buy' | 'sell' | 'protection';
  readonly low: number;
  readonly high: number;
  readonly label: string;
};

// Caixas "Stop e alvo": da entrada ao alvo e da entrada ao stop; `exitTime` nulo = posição aberta (vai até a ponta).
export type SurfaceLevelBox = {
  readonly key: string;
  readonly entryTime: SurfaceTime;
  readonly exitTime: SurfaceTime | null;
  readonly entry: number;
  readonly stop: number;
  readonly target: number;
};

// Rótulos do eixo e da dica no fuso do usuário: a biblioteca desenha em UTC e só chama estas funções (segundos UTC).
export type SurfaceTimeLabels = {
  readonly time: (seconds: SurfaceTime) => string;
  readonly day: (seconds: SurfaceTime) => string;
  readonly full: (seconds: SurfaceTime) => string;
};

export type SurfaceProjection = {
  readonly startTime: SurfaceTime;
  readonly endTime: SurfaceTime;
  readonly base: number;
  readonly low: number;
  readonly high: number;
  readonly side: 'buy' | 'sell';
};

// Cores já resolvidas dos tokens de `global.css` (lidas por `getComputedStyle` num só lugar).
export type SurfaceTheme = {
  readonly background: string;
  readonly text: string;
  readonly grid: string;
  readonly up: string;
  readonly down: string;
  readonly line: string;
  readonly coneUp: string;
  readonly coneDown: string;
  readonly coneNeutral: string;
};

// O ponto do gráfico que um agente comenta, em pixels do contêiner do gráfico (só desenho).
export type SurfaceAnchorKind =
  'band_lower' | 'ema_fast' | 'volume' | 'protection' | 'forming_left' | 'forming_right';
export type SurfaceAnchor = { readonly x: number; readonly y: number };

// A vela da execução em formação, em segundos UTC: o intervalo que a faixa sombreada cobre sobre as velas de exibição.
export type SurfaceFormingSlot = {
  readonly from: SurfaceTime;
  readonly to: SurfaceTime;
  // A duração de uma vela de exibição, em segundos.
  readonly barSeconds: number;
};

export type SurfaceLogicalRange = { readonly from: number; readonly to: number };

export type ChartSurface = {
  readonly setCandles: (candles: readonly SurfaceCandle[]) => void;
  readonly setVolume: (bars: readonly SurfaceVolumeBar[]) => void;
  readonly setLines: (lines: readonly SurfaceLine[]) => void;
  readonly setScore: (
    bars: readonly SurfaceScoreBar[],
    thresholds: readonly SurfaceThreshold[],
  ) => void;
  readonly setMarkers: (markers: readonly SurfaceMarker[]) => void;
  readonly setLevels: (boxes: readonly SurfaceLevelBox[]) => void;
  // Onde está, agora, o ponto que o agente comenta (`null` sem a camada); refeito a cada mudança de faixa ou tamanho.
  readonly anchorOf: (kind: SurfaceAnchorKind) => SurfaceAnchor | null;
  readonly setZones: (zones: readonly SurfaceZone[]) => void;
  readonly setPriceLevels: (levels: readonly SurfacePriceLevel[]) => void;
  // Pontinhos discretos de "esperou" (camada desligada por padrão).
  readonly setWaited: (times: readonly SurfaceTime[]) => void;
  readonly setProjection: (projection: SurfaceProjection | null) => void;
  readonly setLiveCandle: (candle: SurfaceCandle | null) => void;
  // Com vela de exibição, a coluna da vela em formação cobre as velas da vela da execução inteira (`null`: só a vela viva).
  readonly setFormingSlot: (slot: SurfaceFormingSlot | null) => void;
  readonly setCrosshair: (index: number | null) => void;
  readonly onCrosshairMove: (listener: (index: number | null) => void) => () => void;
  readonly onVisibleRangeChange: (listener: (range: SurfaceLogicalRange) => void) => () => void;
  readonly setTheme: (theme: SurfaceTheme) => void;
  readonly setTimeLabels: (labels: SurfaceTimeLabels) => void;
  readonly onClick: (listener: (index: number | null) => void) => () => void;
  // Mantém a largura visível (em velas) e põe o instante no centro; usado ao trocar a vela do gráfico.
  readonly centerOn: (time: SurfaceTime) => void;
  readonly zoom: (step: number) => void;
  readonly fit: () => void;
  // Mostra só as últimas N velas, com a ponta direita à vista (abertura padrão quando o gráfico acompanha o fim).
  readonly showLast: (bars: number) => void;
  readonly scrollToEnd: () => void;
  readonly destroy: () => void;
};

export type ChartSurfaceFactory = (container: HTMLElement) => ChartSurface;
