# Evidência — Spec 017 (gráfico em velas menores)

## Autorização do usuário (2026-10-16, na thread)

O usuário (Anderson) respondeu "pode fazer" à proposta da spec 017 com as decisões **A** do `spec.md` §9. Ficam
AUTORIZADOS, e só eles:

- a **migration aditiva** do `CHECK` de `candles` (aceitar `3m`);
- a **rotina de limpeza** (cron `purge-display-candles`, 90 dias);
- a **recarga (backfill) de 3 min no banco DEV** (últimos 90 dias dos 9 pares, pela tarefa do cron do repositório);
- a **assinatura `kline_3m`** no ticker (e a gravação das velas fechadas de 3 min pelo worker).

Decisões A em tudo: velas de 3 min guardadas só 90 dias; só 3 min de exibição; abre em 3 min nas simulações de 15 min; saída
por alvo/proteção com marca no início da vela de 15 min e colchete sobre as 5 de 3 min.

**NÃO autorizado:** `1m`/`5m` (por isso o `CHECK` aceita só `3m`), chamada externa sob demanda (opção B), mudar o motor.
A Fase 3 (painel) fica para depois: outro agente edita o painel agora.

## T0.1 — contrato (docs/adr/0002, "Gráfico em velas menores (spec 017)")

- A execução de alvo/proteção NÃO grava o instante dentro da vela: `fills.candle_time` é a abertura da vela de 15 min
  (`map-decisions.ts:58`, `fill.candleOpenTime`). Vale D4-A.
- Campo do corte da retenção: `retentionStart`, em `meta` aditivo do envelope (`{ data, meta: { retentionStart } }`), só
  nas velas de exibição.
- Desvio: `MARKET_DISPLAY_TIMEFRAMES` tem padrão VAZIO (o plan dizia `3m`); `envs/env.dev` liga `3m`.
- Pendência: validação do ADR por `architect` (opus) não rodou nesta sessão.
