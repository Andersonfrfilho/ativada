// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MODEL_TEAM_KEYS, MODEL_TEAMS, type ModelTeamKey } from './model-team-catalog.constant.js';
import { PROVIDER_STATE, type ProviderState } from './provider-state.constant.js';

// Catálogo FECHADO das frases da tela (RF17, RNF07). A única fala fora dele é o motivo do modelo (RF08).
export const OPINION_BADGE = {
  up: { icon: '↗', label: 'a favor' },
  down: { icon: '↘', label: 'contra' },
  neutral: { icon: '—', label: 'neutro' },
  pending: { icon: '◷', label: 'pensando' },
  disabled: { icon: '○', label: 'desligado' },
} as const;

export const RETRY_TIME_MARK = '{hora}';

export const PROVIDER_STATE_BADGE: Readonly<
  Record<ProviderState, { readonly icon: string; readonly label: string }>
> = {
  [PROVIDER_STATE.READY]: { icon: '●', label: 'pronto' },
  [PROVIDER_STATE.NO_KEY]: { icon: '⚠', label: 'sem chave configurada' },
  [PROVIDER_STATE.BUDGET_EXHAUSTED]: { icon: '⏸', label: 'parado pelo teto de custo' },
  [PROVIDER_STATE.CIRCUIT_OPEN]: {
    icon: '⚡',
    label: `provedor fora (tentando de novo às ${RETRY_TIME_MARK})`,
  },
  [PROVIDER_STATE.KEY_REJECTED]: { icon: '⚠', label: 'chave recusada pelo provedor' },
  [PROVIDER_STATE.MODEL_NOT_FOUND]: {
    icon: '⚠',
    label: 'modelo indisponível no provedor; confira o id no env',
  },
};

export const HIDDEN_REASON_PHRASE =
  'O modelo deu um motivo fora das regras de linguagem da casa; o texto foi ocultado.';
export const AGENT_NOTICE =
  'Agente de modelo: um modelo de linguagem lê os mesmos dados públicos de mercado e opina. Pode errar; o auditor mede o acerto. Não é recomendação. Tudo simulado.';
export const COST_ESTIMATE_NOTICE =
  'Estimativa pelos tokens e pelo preço configurado; a fatura do provedor é a palavra final.';
export const COMPARISON_NOTICE =
  'Comparação de acerto do lado da próxima vela; não mede lucro e não é recomendação.';
export const ON_DEMAND_MARK = 'pedido avulso · não entra no placar';
export const SHADOW_MODE_LABEL = 'sombra';
export const SHADOW_MODE_EXPLANATION = 'só observa; não decide nada na simulação';
export const GOVERN_LOCKED_NOTICE = 'Disponível depois da sua autorização e de 30 opiniões medidas';

export function buildGeneratedByFooter(team: ModelTeamKey): string {
  return `gerado por modelo: ${MODEL_TEAMS[team].modelFamily} · pode errar`;
}

export function describeProviderState(state: ProviderState, retryTime: string): string {
  const badge = PROVIDER_STATE_BADGE[state];
  return `${badge.icon} ${badge.label.replace(RETRY_TIME_MARK, retryTime)}`;
}

// Toda frase fixa da tela, para a varredura de linguagem proibida (RNF07).
export function listAllPhrases(): readonly string[] {
  return [
    ...Object.values(OPINION_BADGE).map((badge) => badge.label),
    ...Object.values(PROVIDER_STATE_BADGE).map((badge) => badge.label),
    ...MODEL_TEAM_KEYS.map((team) => buildGeneratedByFooter(team)),
    HIDDEN_REASON_PHRASE,
    AGENT_NOTICE,
    COST_ESTIMATE_NOTICE,
    COMPARISON_NOTICE,
    ON_DEMAND_MARK,
    SHADOW_MODE_LABEL,
    SHADOW_MODE_EXPLANATION,
    GOVERN_LOCKED_NOTICE,
  ];
}
