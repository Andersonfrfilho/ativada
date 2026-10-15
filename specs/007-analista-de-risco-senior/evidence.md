# Evidência — Spec 007

## Decisões do usuário (spec §9)

Sem resposta registrada em 2026-10-15: valem os padrões A (D1-A sombra primeiro, D4-A auditor estrito, D5-A vela de
15 min, D6-A dados novos na ordem do custo, D7-A travas conservadoras, D8-A meta somada). **Não autorizado** e só
desenhado no ADR 0002 ("Analista de risco (spec 007)"): migration `analyst_decisions` (D3-A, A19, T2.1), governar e o
comando de tamanho no motor com a migration de `run_commands` (D1, D2-A, A21, Fase 4), colunas em `candles` (T5.2), livro
de ofertas (T5.3) e fontes externas (T5.4).

## T0.1 🧠 — contrato `analyst-1` (opus)

- **ADR 0002, seção "Analista de risco (spec 007)"**: A1 a A22 (pacote, catálogo dos especialistas, série com âncora
  diária, auditor, Wilson único, peso, leituras, `ANALYST_RULES`, travas, ritmo, equipe, postura, saída por tempo, porta e
  comandos, `AnalystDecision`, frases, passo sombra/governar, esquema de `analyst_decisions`, rotas, mudança no motor e
  Fase 2), a tabela fechada de frases em pt-BR e o dourado do auditor.
- **A Fase 1 fecha sem mudar o motor** (conferido no código): especialista de uma família cabe no
  `STRATEGY_CONFIG_SCHEMA` (regime `none`, limiar ±1); aquecimento 129/97/97/97 velas (≤ 200); ATR pelo `risk:atr` do
  próprio `signalStep` e `decimalFromIndicator`; sentimento pelo `selectAvailableSentiment` com o corte do passo; lacuna
  com `confirmedGapCandles` exato. Nada em `packages/strategy-engine` nem `packages/run-recording` mudou.
- **Wilson**: lugar único `packages/statistics/src/wilson-interval.ts` (spec 009 P10), importado; o oráculo (raiz inteira
  em `bigint`) bate com `computeWilsonInterval`/`judgeAgainstCoinFlip` em toda contagem `0 ≤ k ≤ n ≤ 120` no contrato e em
  80.600 pares (`n ≤ 400`) na medição: 0 divergências.
- **Correções do plan registradas no ADR**: `analyst_time_exit` não cabe em `run_commands.reason varchar(16)` → `analyst_timeout`;
  `commandId` sem o `runId` (até 35 caracteres, cabe em `varchar(64)`); os "padrões do editor" da D9 não existem (valores
  fixados no catálogo); o `halt` não tem dono no motor (o dono fica no worker, por `run_commands`, A15/A21); custo dos 4
  especialistas medido em 15,7 ms (mediana) / 18,5 ms (p95) por 500 velas → ~100 ms por par por ronda do zero, daí a
  âncora diária com memo incremental idêntico ao recálculo (A3).
- **Desvio proposto (A11)**: a postura é recalculada em toda vela, sem `lastPosture`; fora da janela de ritmo a porta de
  entrada fica fechada. Pergunta ao usuário registrada no ADR.
- **Oráculo**: `test/fixtures/risk-analyst/` (`auditor-oracle.fixture.ts` só `bigint`, sem importar `src`;
  `specialist-catalog.fixture.ts`; `specialist-dataset.fixture.ts`; `auditor-golden.fixture.ts`) e
  `test/risk-analyst-auditor-oracle.contract.test.ts`. Nos dois conjuntos reais (`btcusdt-1h-500`, `ethusdt-1d-400`),
  janela inteira: **nenhum especialista prova valor** (Tendência 46,47% e 44,32%, Reversão 47,36% e 58,53% (41
  contadas), Volume 50,12% e 44,22% (`below`), Sentimento sintético 45,97% e 46,15%, todos `even` salvo o Volume de ETH);
  peso 0 em todos. O Placar clássico repete a `projection-1` da 009 (285/134 e 192/84, `even`).

Gates (WSL, espelho `~/gates/ativada-spec9`):

```text
bun run typecheck   → verde (tsc raiz e painel)
bun run lint        → verde
bun run format:check → All matched files use Prettier code style!
bun test test/risk-analyst-auditor-oracle.contract.test.ts test/projection-summary-oracle.contract.test.ts test/wilson-interval.contract.test.ts
 49 pass
 0 fail
 123434 expect() calls
```
