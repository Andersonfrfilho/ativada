// Copyright (c) 2026 Ada Technology. All rights reserved.
// Catálogo FECHADO das frases do aviso (spec 014, §5). Nenhuma frase leva data nem hora: o painel troca as marcas
// `{abre}`, `{fecha}`, `{validade}` e `{hora}` pelo horário no fuso do usuário.

export const NOTICE_TIME_TOKEN = {
  OPENS: '{abre}',
  CLOSES: '{fecha}',
  EXPIRES: '{validade}',
  AT: '{hora}',
} as const;

export const NOTICE_CODE = {
  ENTRY_CREATED: 'entry.created',
  ENTRY_CREATED_LIMIT: 'entry.created.limit',
  ENTRY_FILLED: 'entry.filled',
  EXIT_TARGET: 'exit.target',
  EXIT_STOP: 'exit.stop',
  EXIT_SIGNAL: 'exit.signal',
  EXIT_COMMAND: 'exit.command',
  EXIT_GAP: 'exit.gap',
  CANCEL_OPPOSITE_SIGNAL: 'cancel.opposite_signal',
  CANCEL_COMMAND: 'cancel.command',
  EXPIRE_LIMIT: 'expire.limit',
  EXPIRE_GAP: 'expire.gap',
  REJECT_ZERO_ATR: 'reject.zero_atr',
  REJECT_BELOW_MIN_NOTIONAL: 'reject.below_min_notional',
  REJECT_INVALID_STOP: 'reject.invalid_stop',
  REJECT_OTHER: 'reject.other',
  RUN_STALLED: 'run.stalled',
  RUN_RESUMED: 'run.resumed',
  RUN_WAITING: 'run.waiting',
  GOAL_REACHED: 'goal.reached',
  GOAL_STOPPED: 'goal.stopped',
  GOAL_EXPIRED: 'goal.expired',
  PRICE_ALERT_ABOVE: 'price_alert.fired',
  PRICE_ALERT_BELOW: 'price_alert.fired.below',
} as const;
export type NoticeCode = (typeof NOTICE_CODE)[keyof typeof NOTICE_CODE];

export type NoticeText = {
  readonly title: string;
  readonly message: string;
  readonly detail: string | null;
};

export const WILL_IT_CANCEL =
  'Vai cancelar? Cancela se a estratégia mudar de ideia no próximo fechamento, se a simulação for parada ou se faltarem dados do mercado.';

const STATIC_TEXT: Readonly<Partial<Record<NoticeCode, NoticeText>>> = {
  [NOTICE_CODE.ENTRY_CREATED]: {
    title: 'Compra pedida',
    message: `Executa pelo preço de abertura da vela das ${NOTICE_TIME_TOKEN.OPENS}; a simulação confirma às ${NOTICE_TIME_TOKEN.CLOSES}.`,
    detail: WILL_IT_CANCEL,
  },
  [NOTICE_CODE.CANCEL_OPPOSITE_SIGNAL]: {
    title: 'Compra cancelada',
    message: 'A estratégia mudou de ideia antes de executar.',
    detail: null,
  },
  [NOTICE_CODE.CANCEL_COMMAND]: {
    title: 'Ordem cancelada',
    message: 'A simulação foi parada antes de executar.',
    detail: null,
  },
  [NOTICE_CODE.EXPIRE_GAP]: {
    title: 'Ordem cancelada',
    message: 'Faltaram dados do mercado na vela em que ia executar.',
    detail: null,
  },
  [NOTICE_CODE.REJECT_ZERO_ATR]: {
    title: 'Compra não feita',
    message: 'O mercado ficou parado demais para calcular a proteção.',
    detail: null,
  },
  [NOTICE_CODE.REJECT_BELOW_MIN_NOTIONAL]: {
    title: 'Compra não feita',
    message: 'O valor ficou abaixo do mínimo que a corretora aceita.',
    detail: null,
  },
  [NOTICE_CODE.REJECT_INVALID_STOP]: {
    title: 'Compra não feita',
    message: 'A saída de proteção ficaria acima do preço de compra.',
    detail: null,
  },
  [NOTICE_CODE.REJECT_OTHER]: {
    title: 'Compra não feita',
    message: 'A simulação não conseguiu fazer esta compra.',
    detail: null,
  },
  [NOTICE_CODE.RUN_STALLED]: {
    title: 'Simulação parada',
    message: `A simulação não decidiu a vela das ${NOTICE_TIME_TOKEN.AT}.`,
    detail: null,
  },
  [NOTICE_CODE.RUN_RESUMED]: {
    title: 'Simulação voltou',
    message: 'Voltou a decidir.',
    detail: null,
  },
  [NOTICE_CODE.RUN_WAITING]: {
    title: 'Aguardando dados',
    message: 'A simulação espera dados do mercado para continuar.',
    detail: null,
  },
  [NOTICE_CODE.GOAL_REACHED]: { title: 'Meta alcançada', message: 'Meta alcançada.', detail: null },
  [NOTICE_CODE.GOAL_STOPPED]: {
    title: 'Meta encerrada',
    message: 'A simulação parou na perda máxima aceita.',
    detail: null,
  },
  [NOTICE_CODE.GOAL_EXPIRED]: {
    title: 'Meta encerrada',
    message: 'O prazo da meta acabou.',
    detail: null,
  },
};

export function staticNoticeText(code: NoticeCode): NoticeText {
  const text = STATIC_TEXT[code];
  if (text === undefined) throw new Error(`Frase de aviso sem texto fixo: ${code}`);
  return text;
}

export function buildLimitOrderText(limit: string): NoticeText {
  return {
    title: 'Compra pedida (limitada)',
    message: `Executa se o preço chegar a ${limit} até a vela das ${NOTICE_TIME_TOKEN.EXPIRES}; senão, cancela.`,
    detail: WILL_IT_CANCEL,
  };
}

export function buildLimitExpiredText(limit: string): NoticeText {
  return {
    title: 'Compra cancelada',
    message: `O preço não chegou ao limite de ${limit} a tempo.`,
    detail: null,
  };
}
