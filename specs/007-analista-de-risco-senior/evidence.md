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

## T0.2 — medição de base com dados reais (2026-10-15)

Script **somente leitura**: `scripts/risk-analyst-baseline.ts` (+ `scripts/risk-analyst-baseline/`). Lê pelos repositórios do repo (`createCandleRepository`/`createSentimentRepository`, só `SELECT`) o banco `ativada-dev-postgres` (porta 56432; `DATABASE_URL` do `envs/env.dev` lida do ambiente, nunca impressa), roda o `signalStep` de PRODUÇÃO dos 4 especialistas do catálogo A2 e do Placar clássico (a tendência da estratégia, A4) e conta com o **oráculo `bigint`** da T0.1 (cada linha também confere com o Wilson único `@ativada/statistics`; o script aborta se divergir). Nenhuma escrita em tabela, nenhuma migration, nada em `src`, nenhum container tocado. Rodou no espelho WSL (`~/gates/ativada-spec9`), que alcança `127.0.0.1:56432` (20 s no total).

**Cobertura do banco de dev (o backfill de 15 min existe nos 4 pares: nenhuma lacuna a registrar, nada baixado da Binance).** Cada par tem cerca de 2 anos, sem nenhuma vela faltando:

| Par | Vela | Velas | Primeira | Última | Faltando |
|---|---|---|---|---|---|
| LINKUSDT | 15m | 70384 | 2024-10-12T17:00:00.000Z | 2026-10-15T20:45:00.000Z | 0 |
| LINKUSDT | 1h | 17596 | 2024-10-12T17:00:00.000Z | 2026-10-15T20:00:00.000Z | 0 |
| BNBUSDT | 15m | 70384 | 2024-10-12T17:00:00.000Z | 2026-10-15T20:45:00.000Z | 0 |
| BNBUSDT | 1h | 17596 | 2024-10-12T17:00:00.000Z | 2026-10-15T20:00:00.000Z | 0 |
| BTCUSDT | 15m | 70388 | 2024-10-12T16:00:00.000Z | 2026-10-15T20:45:00.000Z | 0 |
| BTCUSDT | 1h | 17597 | 2024-10-12T16:00:00.000Z | 2026-10-15T20:00:00.000Z | 0 |
| ETHUSDT | 15m | 70388 | 2024-10-12T16:00:00.000Z | 2026-10-15T20:45:00.000Z | 0 |
| ETHUSDT | 1h | 17597 | 2024-10-12T16:00:00.000Z | 2026-10-15T20:00:00.000Z | 0 |

Sentimento: `sentiment_daily` (Fear & Greed real, 3.172 dias de 2018-02-01 a 2026-10-12), uma leitura por dia UTC disponível à 00:00 do dia (como no oráculo sintético da T0.1); nos 3 últimos dias a leitura passa de 48 h e o motor vota 0 (`isMissing`). A série de cada item roda **uma vez desde a primeira vela do par** (aquecimento completo); as janelas só mudam quais previsões contam. Janela de 6 meses = últimos 183 dias (17.568 previsões em 15 min, 4.392 em 1 h): a decisão é na última vela e `W` cobre todas as previsões do período.

### Resultado — últimos 183 dias, por par, vela e item ("N de M" = Acertos de Contadas)

| Par | Vela | Item | Previsões | Contadas (M) | Acertos (N) | Acerto | "Sempre sobe" | Wilson 95% | Veredito | Peso |
|---|---|---|---|---|---|---|---|---|---|---|
| LINKUSDT | 15m | Tendência | 17568 | 10921 | 5181 | 47,44% | 50,40% | 46,50% a 48,38% | abaixo da moeda | 0 |
| LINKUSDT | 15m | Reversão | 17568 | 2552 | 1420 | 55,64% | 50,90% | 53,70% a 57,57% | prova valor (acima da moeda) | 0.037080466592 |
| LINKUSDT | 15m | Volume | 17568 | 16625 | 8025 | 48,27% | 50,18% | 47,51% a 49,04% | abaixo da moeda | 0 |
| LINKUSDT | 15m | Sentimento | 17568 | 5143 | 2569 | 49,95% | 50,02% | 48,58% a 51,32% | igual à moeda | 0 |
| LINKUSDT | 15m | Placar clássico | 17568 | 15085 | 7225 | 47,89% | 50,20% | 47,09% a 48,70% | abaixo da moeda | 0 |
| LINKUSDT | 1h | Tendência | 4392 | 2838 | 1365 | 48,09% | 50,28% | 46,26% a 49,94% | abaixo da moeda | 0 |
| LINKUSDT | 1h | Reversão | 4392 | 719 | 406 | 56,46% | 50,20% | 52,81% a 60,05% | prova valor (acima da moeda) | 0.028183430772 |
| LINKUSDT | 1h | Volume | 4392 | 4255 | 2070 | 48,64% | 49,82% | 47,14% a 50,16% | igual à moeda | 0 |
| LINKUSDT | 1h | Sentimento | 4392 | 1301 | 647 | 49,73% | 49,57% | 47,01% a 52,45% | igual à moeda | 0 |
| LINKUSDT | 1h | Placar clássico | 4392 | 3896 | 1882 | 48,30% | 50,12% | 46,73% a 49,88% | abaixo da moeda | 0 |
| BNBUSDT | 15m | Tendência | 17568 | 11609 | 5551 | 47,81% | 50,19% | 46,90% a 48,73% | abaixo da moeda | 0 |
| BNBUSDT | 15m | Reversão | 17568 | 2905 | 1599 | 55,04% | 50,32% | 53,22% a 56,85% | prova valor (acima da moeda) | 0.032285762599 |
| BNBUSDT | 15m | Volume | 17568 | 17487 | 8560 | 48,95% | 50,38% | 48,21% a 49,70% | abaixo da moeda | 0 |
| BNBUSDT | 15m | Sentimento | 17568 | 5269 | 2651 | 50,31% | 50,08% | 48,96% a 51,67% | igual à moeda | 0 |
| BNBUSDT | 15m | Placar clássico | 17568 | 15849 | 7712 | 48,65% | 50,52% | 47,88% a 49,44% | abaixo da moeda | 0 |
| BNBUSDT | 1h | Tendência | 4392 | 2889 | 1395 | 48,28% | 51,88% | 46,46% a 50,11% | igual à moeda | 0 |
| BNBUSDT | 1h | Reversão | 4392 | 755 | 388 | 51,39% | 53,11% | 47,82% a 54,94% | igual à moeda | 0 |
| BNBUSDT | 1h | Volume | 4392 | 4383 | 2099 | 47,88% | 51,49% | 46,41% a 49,37% | abaixo da moeda | 0 |
| BNBUSDT | 1h | Sentimento | 4392 | 1321 | 674 | 51,02% | 51,02% | 48,32% a 53,72% | igual à moeda | 0 |
| BNBUSDT | 1h | Placar clássico | 4392 | 3986 | 1909 | 47,89% | 51,65% | 46,34% a 49,45% | abaixo da moeda | 0 |
| BTCUSDT | 15m | Tendência | 17568 | 11641 | 5532 | 47,52% | 49,31% | 46,61% a 48,43% | abaixo da moeda | 0 |
| BTCUSDT | 15m | Reversão | 17568 | 2877 | 1568 | 54,50% | 48,93% | 52,67% a 56,32% | prova valor (acima da moeda) | 0.026767626113 |
| BTCUSDT | 15m | Volume | 17568 | 17550 | 8415 | 47,94% | 49,47% | 47,21% a 48,69% | abaixo da moeda | 0 |
| BTCUSDT | 15m | Sentimento | 17568 | 5289 | 2586 | 48,89% | 48,66% | 47,54% a 50,25% | igual à moeda | 0 |
| BTCUSDT | 15m | Placar clássico | 17568 | 15868 | 7544 | 47,54% | 49,36% | 46,76% a 48,32% | abaixo da moeda | 0 |
| BTCUSDT | 1h | Tendência | 4392 | 2900 | 1426 | 49,17% | 49,62% | 47,35% a 51,00% | igual à moeda | 0 |
| BTCUSDT | 1h | Reversão | 4392 | 791 | 409 | 51,70% | 52,21% | 48,22% a 55,18% | igual à moeda | 0 |
| BTCUSDT | 1h | Volume | 4392 | 4392 | 2123 | 48,33% | 49,97% | 46,86% a 49,82% | abaixo da moeda | 0 |
| BTCUSDT | 1h | Sentimento | 4392 | 1324 | 653 | 49,32% | 49,32% | 46,63% a 52,02% | igual à moeda | 0 |
| BTCUSDT | 1h | Placar clássico | 4392 | 4002 | 1929 | 48,20% | 49,90% | 46,65% a 49,76% | abaixo da moeda | 0 |
| ETHUSDT | 15m | Tendência | 17568 | 11308 | 5252 | 46,44% | 49,79% | 45,52% a 47,37% | abaixo da moeda | 0 |
| ETHUSDT | 15m | Reversão | 17568 | 2838 | 1604 | 56,51% | 49,36% | 54,68% a 58,34% | prova valor (acima da moeda) | 0.046871909214 |
| ETHUSDT | 15m | Volume | 17568 | 17538 | 8285 | 47,24% | 49,94% | 46,50% a 47,98% | abaixo da moeda | 0 |
| ETHUSDT | 15m | Sentimento | 17568 | 5289 | 2614 | 49,42% | 49,21% | 48,07% a 50,78% | igual à moeda | 0 |
| ETHUSDT | 15m | Placar clássico | 17568 | 15997 | 7518 | 46,99% | 49,97% | 46,22% a 47,78% | abaixo da moeda | 0 |
| ETHUSDT | 1h | Tendência | 4392 | 2873 | 1386 | 48,24% | 49,66% | 46,41% a 50,08% | igual à moeda | 0 |
| ETHUSDT | 1h | Reversão | 4392 | 782 | 408 | 52,17% | 50,89% | 48,67% a 55,66% | igual à moeda | 0 |
| ETHUSDT | 1h | Volume | 4392 | 4388 | 2109 | 48,06% | 50,13% | 46,58% a 49,55% | abaixo da moeda | 0 |
| ETHUSDT | 1h | Sentimento | 4392 | 1324 | 648 | 48,94% | 48,94% | 46,25% a 51,64% | igual à moeda | 0 |
| ETHUSDT | 1h | Placar clássico | 4392 | 3998 | 1919 | 47,99% | 50,30% | 46,45% a 49,55% | abaixo da moeda | 0 |

### Mesma conta na janela do contrato (2.880 velas mais novas) e no histórico inteiro (~2 anos) — Reversão e Placar clássico

As outras linhas (Tendência, Volume, Sentimento) saem do mesmo comando e NENHUMA é `above` em janela alguma (só a Reversão aparece nas listas de quem prova valor).

| Par | Vela | Item | Previsões | Contadas (M) | Acertos (N) | Acerto | "Sempre sobe" | Wilson 95% | Veredito | Peso |
|---|---|---|---|---|---|---|---|---|---|---|
| **2.880 velas mais novas** (30 dias em 15 min, 120 dias em 1 h) | | | | | | | | | | |
| LINKUSDT | 15m | Reversão | 2880 | 441 | 249 | 56,46% | 51,02% | 51,79% a 61,02% | prova valor (acima da moeda) | 0.017989397841 |
| LINKUSDT | 15m | Placar clássico | 2880 | 2586 | 1229 | 47,52% | 50,42% | 45,60% a 49,46% | abaixo da moeda | 0 |
| LINKUSDT | 1h | Reversão | 2880 | 485 | 276 | 56,90% | 49,48% | 52,46% a 61,25% | prova valor (acima da moeda) | 0.024626665491 |
| LINKUSDT | 1h | Placar clássico | 2880 | 2604 | 1244 | 47,77% | 50,49% | 45,85% a 49,70% | abaixo da moeda | 0 |
| BNBUSDT | 15m | Reversão | 2880 | 466 | 259 | 55,57% | 49,35% | 51,04% a 60,03% | prova valor (acima da moeda) | 0.010406201257 |
| BNBUSDT | 15m | Placar clássico | 2880 | 2588 | 1246 | 48,14% | 50,50% | 46,22% a 50,08% | igual à moeda | 0 |
| BNBUSDT | 1h | Reversão | 2880 | 509 | 264 | 51,86% | 53,04% | 47,52% a 56,18% | igual à moeda | 0 |
| BNBUSDT | 1h | Placar clássico | 2880 | 2586 | 1225 | 47,37% | 52,12% | 45,45% a 49,30% | abaixo da moeda | 0 |
| BTCUSDT | 15m | Reversão | 2880 | 494 | 254 | 51,41% | 51,41% | 47,01% a 55,80% | igual à moeda | 0 |
| BTCUSDT | 15m | Placar clássico | 2880 | 2600 | 1229 | 47,26% | 50,96% | 45,35% a 49,20% | abaixo da moeda | 0 |
| BTCUSDT | 1h | Reversão | 2880 | 518 | 267 | 51,54% | 52,70% | 47,24% a 55,83% | igual à moeda | 0 |
| BTCUSDT | 1h | Placar clássico | 2880 | 2590 | 1239 | 47,83% | 50,38% | 45,91% a 49,77% | abaixo da moeda | 0 |
| ETHUSDT | 15m | Reversão | 2880 | 502 | 273 | 54,38% | 47,80% | 50,00% a 58,69% | prova valor (acima da moeda) | 0.000085161247 |
| ETHUSDT | 15m | Placar clássico | 2880 | 2618 | 1261 | 48,16% | 51,10% | 46,25% a 50,09% | igual à moeda | 0 |
| ETHUSDT | 1h | Reversão | 2880 | 501 | 264 | 52,69% | 49,90% | 48,31% a 57,03% | igual à moeda | 0 |
| ETHUSDT | 1h | Placar clássico | 2880 | 2581 | 1239 | 48,00% | 50,98% | 46,08% a 49,94% | abaixo da moeda | 0 |
| **Histórico inteiro** | | | | | | | | | | |
| LINKUSDT | 15m | Reversão | 70183 | 10323 | 5620 | 54,44% | 50,49% | 53,47% a 55,41% | prova valor (acima da moeda) | 0.034793300831 |
| LINKUSDT | 15m | Placar clássico | 70183 | 59211 | 28673 | 48,42% | 49,57% | 48,02% a 48,83% | abaixo da moeda | 0 |
| LINKUSDT | 1h | Reversão | 17395 | 2932 | 1589 | 54,19% | 50,37% | 52,38% a 56,00% | prova valor (acima da moeda) | 0.023872964996 |
| LINKUSDT | 1h | Placar clássico | 17395 | 15288 | 7488 | 48,97% | 49,69% | 48,18% a 49,78% | abaixo da moeda | 0 |
| BNBUSDT | 15m | Reversão | 70183 | 11288 | 6152 | 54,50% | 50,32% | 53,58% a 55,42% | prova valor (acima da moeda) | 0.035803258392 |
| BNBUSDT | 15m | Placar clássico | 70183 | 63843 | 31023 | 48,59% | 50,53% | 48,20% a 48,99% | abaixo da moeda | 0 |
| BNBUSDT | 1h | Reversão | 17395 | 2910 | 1575 | 54,12% | 51,64% | 52,30% a 55,93% | prova valor (acima da moeda) | 0.023089646442 |
| BNBUSDT | 1h | Placar clássico | 17395 | 15835 | 7607 | 48,03% | 51,48% | 47,26% a 48,82% | abaixo da moeda | 0 |
| BTCUSDT | 15m | Reversão | 70187 | 11218 | 6169 | 54,99% | 49,79% | 54,06% a 55,92% | prova valor (acima da moeda) | 0.040697776012 |
| BTCUSDT | 15m | Placar clássico | 70187 | 63718 | 30483 | 47,84% | 49,83% | 47,45% a 48,23% | abaixo da moeda | 0 |
| BTCUSDT | 1h | Reversão | 17396 | 3165 | 1685 | 53,23% | 50,58% | 51,49% a 54,98% | prova valor (acima da moeda) | 0.01497363737 |
| BTCUSDT | 1h | Placar clássico | 17396 | 16048 | 7682 | 47,86% | 50,29% | 47,09% a 48,65% | abaixo da moeda | 0 |
| ETHUSDT | 15m | Reversão | 70187 | 11641 | 6525 | 56,05% | 49,73% | 55,14% a 56,96% | prova valor (acima da moeda) | 0.051484101473 |
| ETHUSDT | 15m | Placar clássico | 70187 | 64343 | 30602 | 47,56% | 50,35% | 47,17% a 47,95% | abaixo da moeda | 0 |
| ETHUSDT | 1h | Reversão | 17396 | 3321 | 1795 | 54,04% | 51,15% | 52,35% a 55,74% | prova valor (acima da moeda) | 0.023513076024 |
| ETHUSDT | 1h | Placar clássico | 17396 | 16032 | 7701 | 48,03% | 50,54% | 47,26% a 48,81% | abaixo da moeda | 0 |

### Conferência com o preview da 009 (LINK 1h)

O preview (`docs/preview/grafico-binance/`) usa um placar APROXIMADO (Donchian 20 + MACD 12/26/9, limiar ±2) sobre LINKUSDT 1h de 2026-09-29 10:00 a 2026-10-14 08:00 UTC. `scripts/risk-analyst-baseline/preview-009.ts` carrega a lógica do próprio preview (o bloco `ChartLogic`, sem copiar) e a roda sobre as mesmas velas lidas do **banco**: 383 velas, **171 acertos de 346 contadas (49,42%)**, os mesmos números do preview, que dão `even` (inferior < 50% < superior; 171 de 346 é um caso do contrato da 009). Confere. Na comparação com o Placar clássico REAL (a linha "Placar clássico" de LINK 1h acima, 6 meses): 48,30% (1.882 de 3.896), `abaixo da moeda`.

### Síntese e veredito

- **Há especialista que prova valor: a Reversão** (RSI 14 + Bollinger 20, contra a tendência), em **5 de 8** pares/velas nos últimos 183 dias — LINK, BNB, BTC e ETH em 15 min e LINK em 1 h —, 4 de 8 na janela de 2.880 velas e **8 de 8 no histórico inteiro** (os 4 pares nas duas velas). Acerto de 54,5% a 56,5% (Wilson inferior 52,7% a 54,7% nos 6 meses de 15 min) sobre 2.500 a 2.900 contadas em 15 min; peso (D4-A) de 0,027 a 0,047 no 15 min. A mesma especialista, nos 4 pares e nas 3 janelas, aponta o mesmo lado: não é sorte de uma conta (com 40 combinações por janela o acaso daria cerca de 1 `above`).
- **Os outros três não provam valor em nenhum par**: Tendência `abaixo` ou `igual`, Volume `abaixo` ou `igual`, Sentimento `igual` (peso 0). O **Placar clássico** (tendência da estratégia) fica **abaixo da moeda em 8 de 8** pares/velas nos 6 meses (47% a 48,7%): o placar sozinho erra o lado do próximo fechamento mais que a moeda. Isso reforça o desenho da A4 (ele pede a entrada, o analista só decide se deixa) e que a equipe pese por quem provou, não pela estratégia.
- **"Prova valor" é só sobre o lado do próximo fechamento** (hits ÷ contadas), não sobre lucro: a Reversão acerta ~55% de movimentos pequenos de 15 min e a trava `move_cost` (A10: movimento ≥ 2 × custo de ida e volta) é quem diz se isso paga as taxas. Isso é a medição da T2.4 (contrafactual), não desta task.
- **Decisão sobre seguir:** como UM especialista prova valor em vários pares, a regra de parada da T0.2 ("nenhum em nenhum par") **não dispara** e a Fase 1 pode seguir quando o usuário mandar. Efeito para a equipe (A12): com só a Reversão aprovada, `W` é o peso dela e a equipe fica `proven_neutral` toda vez que a Reversão não vota (a maior parte das velas: ela só tem lado em 15% a 17% das previsões); a regra de "equipe dividida" nunca acontece com 1 votante. O usuário deve saber que o analista, na prática, só terá opinião nas velas de sobrevenda/sobrecompra — é um efeito da regra D4-A (peso só em `above`), não um defeito.

### Recorte de 15 min gravado para o dourado

- `test/fixtures/risk-analyst/market/btcusdt-15m-3300.json`: BTCUSDT 15m, **3.300 velas contíguas** de 2026-09-10 15:00 até 2026-10-14 23:45 UTC (2.880 da janela + 200 de aquecimento + folga da âncora diária, A3), no formato de linha da Binance (7 campos) dos outros conjuntos; `btcusdt-15m-3300.fear-greed.json`: o Fear & Greed REAL do período (`[observedAt, valor]`, 3 dias antes do início até o fim).
- `test/fixtures/risk-analyst/auditor-golden-15m.fixture.ts`: o dourado `AUDITOR_GOLDEN_15M` (5 itens × janelas 2.880 e 96, mesmo formato do `auditor-golden`), regravável por `bun run scripts/risk-analyst-baseline.ts --write-slice`.
- `test/fixtures/risk-analyst/real-series.fixture.ts`: o construtor da série de votos com sentimento real e `confirmedGapCandles` exato (compartilhado pelo script e pelo teste); `test/risk-analyst-15m-slice.contract.test.ts` prova o dourado, o Wilson único igual ao oráculo e que cortar a série no meio dá os mesmos votos.
- `auditorGolden`: `parseAuditorGolden` passou a ler `null` (hitRate/limites sem contadas, ex.: o Sentimento real na janela de 96 do recorte, em que as últimas leituras já passaram de 48 h).
- A T1.2 deve devolver, no pacote `risk-analyst`, os MESMOS números do oráculo neste recorte (ADR, "Contratos de teste esperados").

Gates da T0.2 (WSL, espelho `~/gates/ativada-spec9`; `.prettierignore` ganhou `test/fixtures/risk-analyst/market`, como o `strategy-engine/market`):

```text
bun run typecheck    → verde (tsc raiz e painel)
bun run lint         → verde (eslint .)
bun run format:check → All matched files use Prettier code style!
bun test test/risk-analyst-15m-slice.contract.test.ts test/risk-analyst-auditor-oracle.contract.test.ts
 40 pass / 0 fail / 21424 expect() calls
```

## T1.1 — pacote `packages/risk-analyst` e leituras de mercado (2026-10-15)

- **Pacote novo** `@ativada/risk-analyst` (workspace, `tsconfig` que estende a base, `main`/`exports` em `src/index.ts`). Só duas dependências, ambas do workspace: `@ativada/strategy-engine` (indicadores, `signalStep`, `EngineDecimal`) e `@ativada/statistics` (o ÚNICO Wilson; consumido na T1.2). Nenhuma dependência nova, nada baixado da internet. `bun.lock` editado só nas linhas do pacote (o bloco `packages/risk-analyst` e a linha `@ativada/risk-analyst@workspace`); no espelho WSL `bun install --frozen-lockfile` aceitou o lock sem mudança ("no changes") e criou os links `packages/risk-analyst/node_modules/@ativada/{statistics,strategy-engine}`. Nenhum `bun install` em `/mnt/c` nem no `node_modules` do Windows; a junção no Windows (Edge) não foi necessária porque nada do painel importa o pacote ainda.
- **`analyst.constant.ts`**: `ANALYST_VERSION = 'analyst-1'`, os vocabulários fechados (especialista, postura, trava, motivos, porta, comandos) e `ANALYST_RULES` com TODOS os números da A9. O mínimo de 30 contadas não é redeclarado (vem de `@ativada/statistics`).
- **`market-readings.ts`** (A8): volume relativo (vela ÷ média das 96 anteriores, a vela `t` fora da média; soma zero = `'0'`; falta de vela = `null`), `atrRate` (ATR do `signalStep` ÷ fechamento), percentis 90/95 nearest-rank (posição `⌈p·N ÷ 100⌉` sobre as velas com leitura em `(t − 2.880·d, t]`, `null` abaixo de 96 amostras), momentum de 4 e 16 velas, custo de ida e volta `2 × (taxa + slippage)` exato e razão movimento ÷ custo. Divisão a 12 casas para BAIXO; tudo em texto decimal (`EngineDecimal`), nenhum float. Velas depois de `t` nunca entram (sem lookahead).
- **Contratos** (`test/risk-analyst-boundary.contract.test.ts`, 7; `test/risk-analyst-market-readings.contract.test.ts`, 21): fronteira (manifesto exato, só imports relativos e os dois pacotes, rede de impurezas com sonda, nada de Wilson reescrito, sem `default export` nem `as`), contas à mão de cada leitura nas bordas (96/95 amostras, 29/30 não se aplicam aqui, `t − 2.880·d` fora e `t` dentro, arredondamento do negativo para baixo, custo zero) e corte da série dando a MESMA leitura. Os testes carregam o código por `loadRiskAnalystApi()` (`test/fixtures/risk-analyst/risk-analyst-api.fixture.ts`, variável `RISK_ANALYST_SOURCE`), para os mutantes da T1.4 entrarem.

```text
bun run typecheck    → verde (tsc raiz e painel)
bun run lint         → verde
bun run format:check → All matched files use Prettier code style!
bun test (boundary + market-readings)                      → 28 pass / 0 fail
bun test (+ strategy-engine-boundary, code-size-limits, app-import-boundary, database.contract, wilson-interval,
          projection-rule/messages/summary-oracle, risk-analyst-15m-slice, risk-analyst-auditor-oracle) → 143 pass / 0 fail
```

## T1.2 — equipe de especialistas e auditor de acertos (2026-10-15)

- **`specialist-catalog.ts`** (A2): `SPECIALIST_CATALOG`, fechado, igual campo a campo ao catálogo escrito à mão do oráculo (`ORACLE_SPECIALIST_CONFIGS`): uma estratégia de UMA família por especialista (Tendência = EMA 9×21 + MACD 12/26/9 + Donchian 20; Reversão = RSI 14 30/70 + Bollinger 20/2; Volume = OBV EMA 20; Sentimento = Fear & Greed 25/75), regime nenhum, limiar ±1 e o risco do Placar clássico.
- **`specialist-team.ts`** (A2, A3): `computeVoteSeries` roda o `signalStep` de PRODUÇÃO vela a vela com a lacuna declarada exata (voto = sinal do placar: negativo -1, zero 0, positivo +1; aquecimento = `null`; `isMissing` quando o dado da regra faltou; `atr` = `risk:atr` do próprio sinal via `decimalFromIndicator`); `runSpecialistTeam` roda os quatro; `selectSentiments` usa `selectAvailableSentiment` com o corte de inserção no fechamento da vela (só a fonte da execução, só o disponível e inserido até o fechamento); `computeSeriesAnchor` dá a âncora diária (00:00 UTC do dia de `t − 3.080·d`: de 3.081 a 3.176 velas, 3.168 para 14/10/2026 23:45 UTC). Nenhum indicador reimplementado.
- **`accuracy-auditor.ts`** (A5 a A7): `auditVotes(série, janela)` conta as previsões `p` com `t − (W + 1)·d < p ≤ t − d` (sem leitura, sem lado, lacuna, empate, acerto, erro), taxas a 4 casas para baixo, veredito e limites pelo `judgeAgainstCoinFlip` de `@ativada/statistics` (o ÚNICO Wilson) e peso `limite inferior − 0,5` só em `above`. A vela `t` nunca conta e nada depois de `t` entra.
- **Paridade com o oráculo `bigint`** (`test/risk-analyst-accuracy-auditor.contract.test.ts`): `toStrictEqual` do resumo inteiro contra o dourado E contra `summarizeAuditor` em 20 casos dos dois conjuntos reais (2 conjuntos × 5 itens × janelas 2.880 e 96) e em 10 casos do recorte real de 15 min (`btcusdt-15m-3300`, Fear & Greed do banco, 5 itens × 2 janelas). Os votos da equipe também batem com os do oráculo (`buildAuditorSeries` e `buildRealAuditorSeries`), com uma lacuna declarada ao motor e com o corte da série no meio.
- **Bordas**: 29 acertos em 29 = `too_few` (peso 0), 30 em 30 = `above` com o peso do oráculo; 60 de 100 (limite inferior 0,50198…, peso positivo e < 0,01) prova valor e 59 de 100 não; 21/30 `above`, 20/30 `even`, 9/30 `below`; toda contagem até 40 dá veredito e limites iguais aos do oráculo. Janela de W previsões, lacuna, empate e `t` sem resultado à mão.
- Catálogo: aquecimento 129/97/97/97 (≤ 200); no recorte, 128 velas sem leitura na Tendência e 96 nas outras; o sentimento do fim do recorte (> 48 h) vota 0 com `isMissing`.

```text
bun run typecheck    → verde (tsc raiz e painel)
bun run lint         → verde
bun run format:check → All matched files use Prettier code style!
bun test (4 arquivos risk-analyst desta fase + 15m-slice + auditor-oracle + strategy-engine-boundary, code-size-limits,
          app-import-boundary, database.contract, wilson-interval, projection-rule/messages/summary-oracle) → 239 pass / 0 fail
```
