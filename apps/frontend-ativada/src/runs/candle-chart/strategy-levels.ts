// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatPrice } from '../../format/format.js';
import type { LiveStatus, RuleTrigger } from '../live-tracking/live-status.validation.js';
import { toDrawingNumber } from './candle-series.js';
import type { SurfacePriceLevel } from './chart-surface.types.js';

export const LEVELS_NOTICE =
  'Níveis da estratégia nesta simulação: valores que o servidor calculou agora, com dinheiro fictício. Não são previsão de preço nem recomendação. Tendência, não promessa.';

const DIRECTION_WORD: Readonly<Record<RuleTrigger['direction'], string>> = {
  above: 'acima',
  below: 'abaixo',
};

function levelOf(role: SurfacePriceLevel['role'], text: string, label: string): SurfacePriceLevel {
  return { key: role, role, price: toDrawingNumber(text), title: `${label} ${formatPrice(text)}` };
}

const STOP_LABEL = 'PROTEÇÃO CONTRA QUEDA · sugestão de venda aqui';

// A regra de PREÇO que ainda não votou a favor: o fechamento que ela espera (só vale para o fechamento, não para o placar).
function triggerLevel(status: LiveStatus): SurfacePriceLevel | undefined {
  const { triggers } = status;
  if (triggers.status !== 'available' || triggers.state !== 'awaiting_entry') return undefined;
  const rule = triggers.rules.find(
    (candidate) =>
      candidate.metric === 'close_price' && candidate.threshold !== null && !candidate.isMet,
  );
  if (rule === undefined || rule.threshold === null) return undefined;
  const label = `${rule.label} vota a favor se fechar ${DIRECTION_WORD[rule.direction]} de`;
  return levelOf('trigger', rule.threshold, label);
}

// Até 3 linhas ao mesmo tempo: com posição aberta, a entrada, o alvo e o stop; sem posição, o gatilho da regra de preço.
export function buildStrategyLevels(status: LiveStatus): SurfacePriceLevel[] {
  const { openPosition } = status;
  if (openPosition !== null) {
    return [
      levelOf('entry', openPosition.entryPrice, 'Entrada'),
      levelOf('target', openPosition.targetPrice, 'Alvo'),
      levelOf('stop', openPosition.stopPrice, STOP_LABEL),
    ];
  }
  const trigger = triggerLevel(status);
  return trigger === undefined ? [] : [trigger];
}
