// Copyright (c) 2026 Ada Technology. All rights reserved.
import { toEngineDecimal } from '../engine-decimal.js';
import { EXIT_REASON } from '../engine-vocabulary.constant.js';
import { closeProtective } from './exit-fill.js';
import { stopExitPrice } from './wallet-pricing.js';
import type { WalletContext, WalletDraft } from './wallet.types.js';

function closeAtStop(draft: WalletDraft, context: WalletContext, stop: string): void {
  const price = stopExitPrice({ stop, open: context.candle.open }, context.parameters);
  closeProtective(draft, context, { price, reason: EXIT_REASON.STOP, trigger: stop });
}

// Gap acima do alvo ou alvo passado: a ordem de alvo está no livro e preenche ao PREÇO DO ALVO.
function closeAtTarget(draft: WalletDraft, context: WalletContext, target: string): void {
  closeProtective(draft, context, {
    price: toEngineDecimal(target),
    reason: EXIT_REASON.TARGET,
    trigger: target,
  });
}

// Stop no toque (`mínima ≤ stop`), alvo só quando a máxima PASSA dele; os dois no mesmo candle: vale o
// stop (lado pior). Gap além do stop sai na abertura; limitada preenchida no meio do candle não sai no
// alvo nesse candle (a máxima pode ter vindo antes do preenchimento).
export function evaluateProtectiveExits(draft: WalletDraft, context: WalletContext): void {
  const position = draft.state.position;
  if (position === null) return;
  const { candle } = context;
  const open = toEngineDecimal(candle.open);
  const isEntryCandle = position.openedCandleOpenTime === candle.openTime;
  if (!isEntryCandle && open.lte(position.stopPrice)) {
    return closeAtStop(draft, context, position.stopPrice);
  }
  if (!isEntryCandle && open.greaterThan(position.targetPrice)) {
    return closeAtTarget(draft, context, position.targetPrice);
  }
  if (toEngineDecimal(candle.low).lte(position.stopPrice)) {
    return closeAtStop(draft, context, position.stopPrice);
  }
  const isBlocked = isEntryCandle && draft.isIntraCandleEntry;
  if (!isBlocked && toEngineDecimal(candle.high).greaterThan(position.targetPrice)) {
    closeAtTarget(draft, context, position.targetPrice);
  }
}
