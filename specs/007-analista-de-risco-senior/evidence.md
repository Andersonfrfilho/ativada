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

## T1.3 — equipe, travas, postura, decisão e frases (2026-10-15)

- **`team-forecast.ts`** (A12): `forecastTeam` soma os pesos (A7) dos quatro especialistas (a tendência da estratégia não vota nem pesa) e devolve lado, força e o motivo de "sem previsão" nesta precedência: `no_data`, `too_volatile` (ATR% > percentil 95), `no_proven_specialist` (peso aprovado zero), `proven_neutral` e `split_team` (`3 × maior < 2 × (a favor + contra)`). Força firme com `3 × vencedor ≥ 2 × peso aprovado inteiro`, os neutros que provaram inclusos. Todas as comparações em decimal exato, sem dividir.
- **`risk-locks.ts`** (A10): as cinco travas, sempre calculadas e mostradas, na ordem `daily_loss` (referência de 24 h − patrimônio ≥ 1% do saldo inicial), `loss_streak` (3 perdas seguidas, pausa de 4 velas depois da última), `trade_count` (8 entradas em `(t − 96·d, t]`), `goal_room` (folga < 2 × `riskPerTrade` × patrimônio; o piso é o `computeGoalLevels` da meta) e `move_cost` (ATR% < 2 × custo de ida e volta).
- **`posture-policy.ts`** (A10, A11, A13): `detectNoData` (espera por dado, vela atrasada, vela faltando, aquecendo), `chooseCadence` (volume relativo < 0,7 → 4 h, < 1,5 → 1 h, senão 15 min), `isOnCadence` (a vela FECHA na hora cheia ou no múltiplo de 4 h UTC), `choosePosture` (dado, primeira trava ativa, mercado parado < 0,4, equipe contra → `pause`; sem previsão → `caution`; a favor fraca → `normal`; firme com volume ≥ 1 e ATR% ≤ percentil 90 → `confident`, senão `normal` com o que faltou) e `riskScaleOf` (0, ¼, ½, 1; nunca acima de 1). A postura é recalculada em toda vela, sem `lastPosture` (decisão do usuário sobre a A11): fora da janela de ritmo a porta de entrada fica fechada.
- **`analyst-decision.ts`** + `specialist-views.ts` + `analyst-commands.ts` (A14 a A16): `decideAnalyst(entrada)` devolve `entryGate`, `timeExitDue` (posição aberta há 4 velas), `riskScale` e `commands`. A regra só TIRA risco: os únicos comandos possíveis são `halt` (porta fechada e carteira solta), `resume` (só quando o `halt` foi do próprio analista, `lastHaltReason = analyst_pause`; halt de meta, usuário ou kill switch nunca é desfeito) e `exit_position` (saída por tempo, em toda vela, inclusive em pausa); nunca um comando de entrada. `commandId = analyst:<candleTime>:<kind>`.
- **Rótulos (decisão do usuário)**: MODERADA e LIBERADA no lugar de NORMAL e CONFIANTE. **`analyst-messages.constant.ts`, `analyst-message-format.ts`, `analyst-messages.ts`, `specialist-messages.ts`, `analyst-view-messages.ts`**: o catálogo FECHADO da A17 (linha de postura, janela de entrada, ritmo, falta de dado, cinco travas e as cinco linhas, mercado parado, equipe, saída por tempo, meta somada, modo, falha, indisponível, aviso fixo e a tabela da equipe), números pt-BR com 2 casas e arredondamento na direção do campo (perda e custo para cima; folga, acerto, volume e somado para baixo), menos tipográfico (U+2212) e ponto de milhar.
- **Contratos** (`test/risk-analyst-{team-forecast,risk-locks,posture-policy,decision,messages,properties}.contract.test.ts`, 119 testes): contas à mão por etapa e por borda (2/3 do peso exato, perda de 1% exata, 3ª perda na mesma vela e fim da pausa na 4ª, 8ª entrada, folga igual a 2 operações, movimento igual a 2 × custo, volume 0,4/0,7/1/1,5, ATR% igual ao percentil 90); decisão de ponta a ponta num mercado sintético em que a Reversão provou valor (100 acertos em 100, peso do oráculo); texto literal de TODA chave do catálogo e a varredura de palavras proibidas ("vai subir", "garantid", "recomendamos", "compre", "venda", "confiante") sobre o catálogo e sobre 20 decisões geradas; **2.000 sorteios**: tamanho ≤ 1 (só 0, ¼, ½, 1), qualquer trava ativa → `pause`, equipe contra → `pause`, falta de dado → `pause` sem previsão, só `halt`/`resume`/`exit_position`, `resume` só sobre o halt do analista, `exit_position` sempre que há posição aberta há 4 velas (nunca barrada), todas as posturas e os três comandos exercitados, mesma entrada → mesma decisão byte a byte e velas/votos depois de `t` não mudam a decisão.

```text
bun run typecheck    → verde (tsc raiz e painel)
bun run lint         → verde
bun run format:check → All matched files use Prettier code style!
bun test (os 10 arquivos risk-analyst + strategy-engine-boundary, code-size-limits, app-import-boundary, database.contract,
          wilson-interval, projection-rule/messages/summary-oracle) → 359 pass / 0 fail
```

## T1.4 — dourado `analyst-1` e mutantes (2026-10-15)

- **Dourado literal** (`test/fixtures/risk-analyst/analyst-golden.fixture.ts`, 12 casos; gravado por `bun run scripts/record-risk-analyst-golden.ts`, que usa o código de PRODUÇÃO): a decisão inteira e as frases (`buildAnalystMessages`) em JSON compacto. 6 casos do **recorte real de 15 min** (BTCUSDT, 3.300 velas e o Fear & Greed do banco; velas 3299, 3000, 2600, 2000, 1500) e 6 de um **mercado sintético de 3.000 velas** (processo de reversão à média, semente 4242, em que a Reversão prova valor: 129 de 160, `above`; Tendência e Volume `below`). Cada caso com uma carteira (limpa, perdendo 1,1%, 8 entradas em 24 h, saída por tempo com o halt do analista, 3 perdas seguidas, folga curta da meta) e um custo (padrão, ou taxa 0,02% + slippage 0,01% no caso `real:3000:cheap`). No custo padrão o BTC de 15 min fica em PAUSA por `move_cost` (ATR% 0,11% a 0,28% contra 0,6% exigidos: movimento ÷ custo de 0,37 a 0,92): é o resultado honesto da casa; com o custo baixo o mesmo mercado vira CAUTELA (ninguém provou valor). Os instantes sintéticos saíram da varredura de todas as velas de 1.200 a 2.999 e cobrem LIBERADA com a porta aberta (1 h e 15 min), MODERADA por oscilação alta e por volume baixo, equipe contra e CAUTELA com `too_volatile`.
- **`test/risk-analyst-golden.contract.test.ts`** (27 testes): cada caso é igual ao dourado byte a byte; a tabela da equipe de cada decisão repete o **oráculo `bigint` do auditor** (contadas, acertos, taxas, veredito, limites e peso) calculado sobre a mesma série de votos; o dourado cobre pausas, mais de 3 posturas, `above` e `below`, previsão a favor, saída por tempo e as quatro travas; nenhum caso passa de 1 × o risco da estratégia.
- **52 mutantes** (`test/risk-analyst-mutants.contract.test.ts`, cópias de `packages/risk-analyst/src` rodadas num processo à parte, como no motor), todos MORTOS, mais a cópia de controle que passa nos 10 contratos: média de volume com a vela atual (lookahead), percentil por arredondamento para baixo, 95 amostras, janela do percentil com a borda velha, divisão para cima, momentum de 5 velas; auditor contando a vela `t`, horizonte de 0 velas (`t+1` trocado por `t`), janela uma vela curta, empate como erro, taxa para cima, peso pago a `even`/`below`, base do peso 0,4; sentimento sem o corte de inserção, voto neutro virando +1, lacuna não declarada, âncora deslizante, Bollinger de 3 desvios; equipe dividida e firme em 2/3 exatos, tendência da estratégia votando, neutros fora do peso aprovado, `too_volatile` no percentil exato, equipe contra sem pausa, mercado parado em 0,4 exato, LIBERADA com volume > 1 e ATR% < percentil 90, fraca e firme trocadas, ritmo em 0,7 e 1,5 exatos, janela de entrada pela abertura, ritmo de 1 h = 30 min, tamanho 2×; perda do dia, 3ª perda, pausa de 4 velas, 8ª entrada, borda da janela de 24 h, folga de 2 operações, movimento ÷ custo (2 mutantes), ordem das travas; saída por tempo uma vela antes e uma depois, `resume` desfazendo qualquer `halt`, saída por tempo barrada pela porta fechada, `halt` repetido; rótulos NORMAL/CONFIANTE, risco em % para baixo e o aviso sem a negação.

```text
bun run typecheck    → verde (tsc raiz e painel)
bun run lint         → verde
bun run format:check → All matched files use Prettier code style!
bun test (todos os risk-analyst + strategy-engine-boundary, code-size-limits, app-import-boundary, database.contract,
          wilson-interval, projection-rule/messages/summary-oracle, api-run-projections, api-run-strategy-layers) → 495 pass / 0 fail
bun test test/risk-analyst-mutants.contract.test.ts → 54 pass / 0 fail (52 mutantes mortos, controle verde)
```

## Fase 1 — fechamento (2026-10-15)

`packages/risk-analyst` está completo e puro: leituras, equipe, auditor com o Wilson único, travas, ritmo, postura, saída por tempo, comandos (só `halt`, `resume` e `exit_position`) e o catálogo de frases, com dourado e 52 mutantes. Nada em `packages/strategy-engine` nem `packages/run-recording` mudou; sem migration; sem worker, API nem painel. A Fase 2 (sombra no worker, T2.1 pede autorização da migration `analyst_decisions`) NÃO foi iniciada.

## Autorização registrada (2026-10-15)

O usuário (Anderson) autorizou na thread, em 2026-10-15, os itens 1 e 2 da lista de autorizações da spec: (1) a migration aditiva da tabela `analyst_decisions` (D3-A, T2.1) e (2) a mudança no motor e em `run_commands` da Fase 4 (governar a simulação e o comando de tamanho, D1 e D2-A; ainda NÃO executada, só a T2.1 e a T2.2 desta rodada). Mensagem do usuário: "ta autorizado ja era para ter feito". **Continuam NÃO autorizados:** colunas em `candles` (T5.2), fotos do livro de ofertas (T5.3) e fontes externas (T5.4).

## T2.1 — tabela `analyst_decisions` (2026-10-15)

- **Migration `0024_analyst_decisions`** (0024 era o próximo número livre; a última era a 0023) + `.rollback.sql` (`DROP TABLE`), gerada pelo `drizzle-kit` (snapshot e `_journal.json` incluídos; segunda geração depois do lint respondeu "No schema changes"). Colunas e `CHECK` da A19 (versão, modo, estado, postura, ritmo 15/60/240, porta, tamanho 0/0,25/0,5/1 e a coerência `decided` ⇒ postura, ritmo, porta e tamanho; `failed` ⇒ `failure_code`), FK composta `(run_id, user_id) → runs ON DELETE RESTRICT`, único `(run_id, candle_time)` e índice `(user_id, run_id, candle_time DESC)`. Sem ENUM nativo.
- **Código** (`packages/database/src/`): `schema/analyst-decisions.schema.ts`, `analyst/analyst-decision.{constant,types,repository}.ts` e `analyst-decision-record.mapper.ts`. Desvio de nome: o repositório é `analyst-decision.repository.ts` (padrão `*.repository.ts` do pacote), não `analyst-decisions.ts` da A19. `createAnalystDecisionRepository` (`appendAnalystDecision` idempotente por vela, `findAnalystDecision`, `findLatestAnalystDecision`, `listAnalystDecisionsPage` decrescente por cursor) tem `OwnerScope` no tipo de toda chamada; `insertAnalystDecision(executor, scope, input)` fica interno ao pacote para a T2.3 gravar na transação do passo.
- **Registro**: `analystDecisions` em `OWNED_TABLES`, em `OWNED_TABLE_DELETION_ORDER` ANTES de `runs` e em `OWNED_TABLE_EXPORTS` (19 colunas, sem `id` nem `userId`; lista em `ownership/analyst-decision-export-columns.ts` por causa do teto de 200 linhas).
- **Checks de banco real** (`test-support/analyst-decision-checks.ts`, ligado ao `database-test`): ida e volta (jsonb volta como objeto/lista; tamanho em texto exato), imutabilidade por vela (repetir não grava nem muda), linha de falha só com o código, 9 valores fora do catálogo barrados com `23514`, páginas decrescentes de 2 em 2 sem repetir nem pular, outro dono não lê nem grava (FK composta) e `DELETE` da execução barrado (RESTRICT). LGPD no mesmo `database-test`: `analyst_decisions` entrou em `PERSISTENCE_TABLES` (2 linhas semeadas por dono; exportação de A completa e sem vazar B; purga de A zera e B fica intacto; páginas de 1 linha da exportação em fluxo iguais). `migration-test` confere que a tabela existe depois de aplicar e que o rollback não deixa tabela.
- **Onde rodou**: Postgres EMBUTIDO do WSL (`~/pg-scratch/data-007`, porta 56438, `pgctl-007.sh`), `DATABASE_URL` direto; nenhum Docker e nenhum container/volume `ativada-dev-*` tocado. **Desvio:** `make lgpd-test` (`scripts/lgpd-test.ts`) exige Docker (Keycloak, API e cron) e NÃO foi rodado; a exportação e a purga LGPD da tabela foram provadas pelo `database-test` (mesmos `PERSISTENCE_TABLES` que o `lgpd-test` reaproveita em `scripts/lgpd-test/`). O `make database-test`/`migration-test` equivalem a `bun run --cwd packages/database db:database-test|db:migration-test` neste Postgres.
- **NÃO aplicada no banco DEV**: o app dev aplica a 0024 no próximo `dev-up`.

```text
bun run typecheck    → verde
bun run lint         → verde
bun run format:check → All matched files use Prettier code style!
db:migration-test    → OK (25 migrations aplicadas e desfeitas)
db:database-test     → OK (inclui as 3 verificações analyst_decisions e a exportação/purga de 15 tabelas)
bun test (ownership-registry, database.contract, strategy-persistence-schema, code-size-limits,
          app-import-boundary, strategy-engine-boundary) → 140 pass / 0 fail
```

## T2.2 — `runs.request.analyst` no `POST /v1/runs` (2026-10-15)

- **Corpo**: `analyst: { mode: 'shadow' | 'govern' }` (opcional, `z.strictObject`; `apps/api-ativada/src/runs/run-analyst-request.ts`). Aceito só em `live_paper` com `timeframe` `15m`; grava em `runs.request.analyst = { version: 'analyst-1', mode: 'shadow' }` (convive com `survival` e `goal` no mesmo pedido). Sem `analyst` nada muda (o pedido sai sem a chave).
- **Recusas `400` (todas no envelope de validação, com `details[{ field, reason }]` e sem eco do valor)**: outro tipo (`backtest`, `walk_forward`) = `analyst` / `not_allowed_for_kind`; vela que não é 15m = `analyst` / `analyst_requires_15m_timeframe` (a "mensagem" do motivo, estável como os demais motivos de validação do repo); `mode: 'govern'` = `analyst.mode` / `govern_not_available` (até a Fase 4); modo inválido, ausente ou campo desconhecido = os motivos do Zod. Nenhuma execução é criada nas recusas.
- **Desvios**: (1) `ANALYST_REQUEST_VERSION`/`ANALYST_REQUIRED_TIMEFRAME` são constantes da API (a API não depende de `@ativada/risk-analyst`; adicionar a dependência mexeria no `bun.lock`); o contrato confere que seguem `ANALYST_VERSION` e `ANALYST_RULES.baseTimeframe` do pacote puro. (2) Para caber nos limites do lint (função ≤ 40, arquivo ≤ 200), `runParameters` e `RunSetup` saíram de `create-run-request.schema.ts` para `create-run-setup.ts` (movimento sem mudança de comportamento).
- **OpenAPI**: o corpo documentado é o próprio Zod (`documentation.body`), então `analyst` entra no documento; o resumo da rota ganhou a frase do analista. `api-openapi` verde.
- **Contratos** (`test/api-run-analyst-request.contract.test.ts`, 9 testes com `loadApiApp()` via `createRunsHarness`): 15m em sombra aceita e guarda o pedido; convive com piso/dobro; 1h = 400 com o motivo e nada criado; backtest e walk-forward = 400; sem analista nada muda (1h e 15m); `govern` = 400; modo inválido/ausente/campo desconhecido/texto solto sem eco do valor; versão e vela base iguais às do pacote puro. Nada em `packages/strategy-engine`, `packages/run-recording`, worker ou painel foi tocado.

```text
bun run typecheck → verde
eslint (apps/api-ativada/src/runs, test, packages/database) → limpo; `bun run lint` do repo inteiro e `format:check` só acusam arquivos de OUTRO executor em andamento (apps/frontend-ativada: team-room, glossário, global.css), nenhum meu
prettier --check (apps/api-ativada, test, packages/database, specs, docs) → All matched files use Prettier code style!
bun test (api-run-analyst-request, api-runs*, api-run-admission/queue/symbol/delete/export, api-openapi, code-size-limits,
          app-import-boundary, strategy-engine-boundary, ownership-registry, database.contract, strategy-persistence-schema) → verde
```

## T2.3 — analista de risco em SOMBRA no passo ao vivo (2026-10-16)

- **Passo** (`apps/worker-ativada/src/live/`): `analyst-step.ts` (`decideShadowStep`: registra o passo no histórico, monta a entrada, roda `decideAnalyst` e devolve a linha; **nada lança**), `load-analyst-context.ts` (`isShadowAnalystRequested`, `createAnalystKit`, `loadAnalystInput`: série do par + o que a simulação gravou + a carteira DEPOIS do passo de `t`), `analyst-series-cache.ts` (a série do par), `analyst-run-history.ts` (placar, patrimônio e posições da PRÓPRIA simulação, lidos do banco uma vez por ronda e acrescidos a cada passo), `analyst-record.ts` (a linha de `analyst_decisions`), `analyst-failure.ts` (códigos estáveis) e `analyst-live.constant.ts`. O avaliador (`live-evaluator.ts`) cria UMA cópia da série por instância e a passa a todas as simulações da ronda. O pedido `runs.request.analyst` só vale com `version = analyst-1`, `mode = shadow` e vela de 15 min; qualquer outro deixa a simulação sem analista. Detalhes e desvios no ADR 0002 ("T2.3 — como a sombra entrou no worker").
- **Na MESMA transação do passo** (`create-live-run-database.ts` → `writer.appendAnalystDecision`): `INSERT … ON CONFLICT (run_id, candle_time) DO NOTHING` e, só se a linha é nova, `pg_notify('run_events', { runId, kind: 'analyst', eventId: <abertura da vela> })` (`RUN_EVENT_KIND.ANALYST`). A API entrega o aviso por dono como entrega os outros (o despachante só repassa o `kind`; o painel já aceita qualquer `kind` e refaz as consultas da raiz `runs`). Desfeito o passo, somem a linha e o aviso.
- **Falha da sombra**: qualquer erro (série, histórico, motor, entrada) grava a linha `failed` com SÓ o código (`ANALYST_SERIES_UNAVAILABLE`, `ANALYST_INPUT_INVALID`, `ANALYST_ENGINE_REFUSED:<código>`) e a frase fixa; o passo segue. Nem o banco nem o log levam o texto do erro (teste com `postgres://usuario:segredo@…` no erro: nenhum vestígio).
- **Banco** (`packages/database`): `createAnalystDecisionRepository(...).readAnalystHistory` (placar, patrimônio, posições abertas, fechadas desde a vela e as 3 últimas fechadas; preso ao dono), `RunBatchWriter.appendAnalystDecision`, `publishAnalystEvent`. Sem migration.
- **Pacote puro** (`packages/risk-analyst`): `advanceVote`/`createVoteCursor` (o passo de uma vela, que `computeVoteSeries` passou a usar, então a série inteira e o avanço incremental são o MESMO código). Para o passo caber em 50 ms a regra ganhou três atalhos que não mudam nenhum número: `compareDecimalTexts` (preço por dígitos no auditor), `sortDecimalTexts` (percentis por inteiro exato) e o `atrRate` de cada leitura memorizado pelo objeto: `decideAnalyst` na série cheia (3.168 velas) foi de **62 ms para 9 ms**. Dourado, oráculo e os 52 mutantes seguem verdes; o mutante `GAP_NOT_DECLARED_TO_THE_ENGINE` manteve a mesma âncora de texto.
- **Provas** (fixture `loadAnalystLiveParts()` em `test/fixtures/live/live-api.fixture.ts`; conjunto real de 15 min = o recorte BTCUSDT de 3.300 velas da T0.2, `analyst-real-data.fixture.ts`):
  - `test/live-analyst-series.contract.test.ts` (10): o avanço incremental em memória é IGUAL ao recálculo desde a âncora em toda vela de um trecho contíguo e atravessando a âncora diária; uma ronda longa lê a série numa leitura só; cortar a série no meio dá a mesma vista; lacuna do banco declarada exata; **cinco simulações do mesmo par na mesma ronda dividem UMA leitura** e a ronda seguinte lê só a vela nova; leitura que falha vira a falha tipada sem texto e não corrompe a cópia; vela `t` ausente = indisponível.
  - `test/live-analyst-shadow.contract.test.ts` (16): **`signals`/`orders`/`fills`/`positions`/`equity_points`/`run_commands` e o estado do motor IGUAIS byte a byte com e sem a sombra** no recorte real de 15 min (900 velas e as 3.300 inteiras, série cheia de 30 dias) e nos dois conjuntos reais de 1 h e 1 d (onde o pedido é ignorado e nada é decidido); pedido `govern`, versão ou modo desconhecidos = sem analista; uma decisão por vela confirmada, na grade de 15 min; vela atrasada = `no_data`; queda no meio da transação desfaz passo E decisão e a retomada grava a vela uma vez; retomar noutra instância dá as MESMAS decisões da execução contínua (histórico relido do banco); falha do histórico (inclusive repetida na mesma ronda) = linha `failed` só com o código, simulação idêntica à sem sombra; a linha gravada é a da regra pura recalculada à parte (velas com posição aberta, fechada e sem posição) e a tendência da estratégia repete o auditor sobre os sinais gravados; o analista lê o par no máximo UMA vez por ronda com 5 simulações.
  - `test/live-analyst-performance.contract.test.ts` (fora do julgamento dos mutantes): **p50 9,58 ms, p95 14,77 ms por simulação por vela** com 5 simulações do mesmo par e a série cheia (444 velas × 5; o máximo, 89 ms, é a vela que monta a série do dia). Meta: ≤ 50 ms.
  - `test/risk-analyst-decimal-texts.contract.test.ts` (6): os três atalhos dão o que o decimal daria (20.000 pares e 500 listas sorteados, textos fora do formato simples, memória por leitura).
  - `test/live-analyst-mutants.contract.test.ts`: **25 mutantes mortos** com a cópia de controle verde (série não dividida, âncora que desliza, vista sem o corte em `t`, sentimento ignorado, vela vizinha no lugar da ausente, falhas não tipadas ou que escapam do passo, decisão fora do commit, histórico que não relê, olhar curto demais, voto da estratégia invertido, referência de patrimônio ignorada, vela nunca atrasada, `govern`/versão/vela aceitos, modo ou mensagem errados, código do motor perdido, texto do erro vazando). Sobreviveu um na primeira rodada (`ANALYST_HISTORY_SEEDED_EVEN_WHEN_THE_READ_FAILS`) e o teste da falha passou a rodar em rondas de 250 passos para matá-lo. Os testes de `live-mutants` e `live-goal-mutants` não mudaram (juiz próprio: `LIVE_ANALYST_JUDGE_TEST_FILES`).
  - Banco real (Postgres embutido do WSL, `~/pg-scratch/data-007`, porta 56441; nenhum Docker e nenhum `ativada-dev-*`): `db:database-test` ganhou `checkAnalystEvent` (nada antes do COMMIT, um aviso `{ runId, kind: analyst, eventId }` por vela nova, repetida não grava nem avisa, lote desfeito não deixa linha nem aviso) e `checkAnalystHistory` (placar e patrimônio desde a vela, posições abertas + fechadas desde ela + as 3 últimas, outro dono não lê nada).
  - **`live-test` (equivalente ao `make live-test`, `scripts/live-test.ts` contra o Postgres embutido, API e worker reais)** com o check novo `check-analyst.ts`:
    - `(T2.3) analista em sombra: 1100 velas de 15 min, uma decisão e um NOTIFY analyst por vela na mesma transação do passo; SIGKILL após 300 passos deixou exatamente 300 decisões e a retomada completou sem duplicar nem perder (decisões IDÊNTICAS às da execução contínua, digest 801e1b042426f404); sinais, ordens, operações, posições, saldo e comandos IDÊNTICOS aos da simulação sem sombra (digest 686262a18612781a); contínua com sombra em 10498 ms contra 5970 ms sem` — e o resto do `live-test` (paridade com o backtest, morte do processo, candle repetido, dois workers, lacuna, falhas tipadas, API real) segue verde: `live-test: OK`.
  - O check novo, em palavras: três usuários, três simulações de 15 min do mesmo recorte real (1.100 velas): sem sombra; com sombra e uma queda transitória do banco no 301º passo (antes de gravar); com sombra e o processo morto por SIGKILL depois do passo 300 e retomado por outra instância. As linhas de resultado das três são iguais (digest), as duas com sombra têm uma decisão por vela, na grade de 15 min, e as decisões da retomada depois da morte são iguais às da execução contínua; os avisos `analyst` de cada simulação são exatamente um por vela (nenhum a mais depois da morte no meio da transação, nenhum na sem sombra).
  - `scripts/live-mutants.ts` ganhou 2 mutantes do adaptador (decisão não gravada no passo; histórico lido de outra execução) e o juiz passou de 280 s para 420 s por causa do check novo (+~70 s); **não os rodei** (cada um levaria o `live-test` inteiro, ~12 min), então ficam pendentes no `make live-mutants`.

**`test/live-mutants.contract.test.ts` (a pergunta da tarefa anterior).** Os 3 mutantes que falharam com erro de carga (`HASHES_NOT_RECOMPUTED`, `RUN_KIND_NOT_CHECKED`, `ENGINE_VERSION_NOT_CHECKED`) **não são do HEAD**: num espelho LIMPO do HEAD (`git archive HEAD` em `~/gates/ativada-spec7-head`, sem nenhum arquivo meu nem do outro agente) o arquivo passa **66/66** em duas rodadas seguidas (424 s com a máquina em carga 30 e 169 s depois), e na minha árvore (com todo o trabalho desta task) também **66/66 em 189 s**. A causa mais provável é o espelho COMPARTILHADO: o `rsync --delete` do `gates*.sh` de outro agente apaga `apps/worker-ativada/.mutants/` (a pasta onde cada mutante roda não está na lista de exclusões do `rsync`) no meio da rodada, e os mutantes que editam o mesmo arquivo (`load-live-context.ts`) caem com "erro de carga". Não é flaky no HEAD nem mudou nada no código: **regra para as próximas tasks:** um espelho por spec (`~/gates/ativada-spec7`) e as rodadas longas (mutantes, `live-test`) numa CÓPIA do espelho (`~/gates/ativada-spec7-run`), nunca no que o `gates*.sh` sincroniza.

**Gates** (WSL, espelho próprio `~/gates/ativada-spec7`; Postgres embutido porta 56441, scripts `gates7.sh`, `pgctl-007.sh`):

```text
bun run typecheck    → verde (tsc raiz e painel)
bun run lint         → verde (eslint .)
bun run format:check → All matched files use Prettier code style!
db:database-test     → OK (inclui checkAnalystEvent e checkAnalystHistory; uma 1ª rodada falhou só na medição de tempo
                       "lote lento: 1625 ms" da gravação em lote, meta < 1.500 ms, com a máquina carregada; repetida: 803 ms)
live-test            → OK (scripts/live-test.ts inteiro contra o Postgres embutido, com envs/env.test)
bun test (live-*, live72-*, risk-analyst-*, strategy-engine-boundary, code-size-limits, app-import-boundary,
          database.contract, ownership-registry, api-run-analyst-request, strategy-persistence-schema,
          run-event, run-event-dispatcher)                                                 → 899 pass / 0 fail
test/risk-analyst-mutants.contract.test.ts                                                 → 52 mutantes mortos, controle verde
test/live-analyst-mutants.contract.test.ts                                                 → 25 mutantes mortos, controle verde (313 s)
test/live-mutants.contract.test.ts                                                         → 66 pass / 0 fail (189 s)
test/live-goal-mutants.contract.test.ts                                                    → 31 pass / 0 fail (81 s)
test/live-analyst-performance.contract.test.ts                                             → p50 9,58 ms, p95 14,77 ms, máx. 89,48 ms
```

- **Não feito:** `make live-mutants` (os 2 mutantes novos do adaptador) e `make lgpd-test` (pede Docker, como na T2.1); `make migration-test` não se aplica (sem migration). A 0024 continua só no banco de teste; o banco de dev não foi tocado.

## T2.4 — contrafactual: o que o analista teria feito (2026-10-16)

**Como foi medido.** `scripts/analyst-counterfactual.ts` (+ `scripts/analyst-counterfactual/`), em MEMÓRIA, sem gravar nada. Dados reais do banco de dev (`ativada-dev-postgres`, porta 56432), lidos só por `SELECT` pelos repositórios do repo (`createCandleRepository(...).findCandles` e `createSentimentRepository(...).findFearGreed`): 183 dias de velas de 15 min dos quatro pares (17.568 velas, de 2026-04-16T03:00Z a 2026-10-16T02:45Z) e o Fear & Greed diário. Para cada par e cada estratégia: (a) a estratégia sozinha, o passo do produto (`advanceCandle`) sobre a série; (b) a MESMA estratégia com o analista governando uma carteira em memória. O analista é o do worker, sem cópia: o `decideShadowStep` com a série do par por âncora diária (A3) e o histórico da própria execução; os comandos que ele dá (`halt`, `resume`, `exit_position`) refazem o candle com `commands`, como a saída por meta, com os motivos que o motor JÁ conhece (`user_stop`, `user_resume`, `window_end`) porque nada é gravado e a Fase 4 ainda não mudou o motor. A porta que o analista fechou é a que ele reabre; a decisão de cada vela usa só velas até `t`.

- **Estratégias.** "Placar clássico" = a estratégia de exemplo do produto (`CLASSIC_SCOREBOARD_STRATEGY`). "Reversão" = a estratégia de uma família só que o especialista Reversão do analista usa (`SPECIALIST_CATALOG.reversion.config`: RSI 14 em 30/70 + Bollinger 20/2, compra com +1 e vende com −1, mesmo risco de ATR 14, stop 2×, alvo 3×, 1% do saldo por operação). Saldo inicial 10.000 USDT, taxa 0,1% e slippage 0,05% por lado, filtros de preço e quantidade de cada par (`resolveSymbolFilters`).
- **Veredito D11.** Janelas seguidas de 7 dias (26 em 183 dias; o dia que sobra não entra): "à frente" = o líquido da semana COM o analista maior que SEM; "atrás" = menor; igual não conta. Wilson 95% do `@ativada/statistics` (o único) sobre à frente ÷ (à frente + atrás); `ajudou` se o limite inferior passa de 50%, `atrapalhou` se o superior fica abaixo, `empatou` no meio, `poucas semanas` abaixo de 20 semanas com diferença.
- **Nada gravado.** `--counts` (só `SELECT`) antes e depois da medição: `runs=60` nas duas, e `analyst_decisions` nem existe neste banco (a 0024 só entra no próximo `dev-up`); o contrato `test/analyst-counterfactual.contract.test.ts` varre o script e o leitor de mercado atrás de qualquer escrita.
- **Reproduzir** (espelho WSL, `DATABASE_URL` do `envs/env.dev`, nunca impressa): `bun run scripts/analyst-counterfactual.ts --job LINKUSDT:classic --out dir/LINKUSDT-classic.json` (um por par e estratégia; os 8 em paralelo levam ~9 min), depois `--report dir --out relatorio.md`.

### Relatório literal (saída de `--report`)

Período medido: 2026-04-16T03:00:00.000Z a 2026-10-16T02:45:00.000Z (17568 velas de 15 min, 183 dias), saldo inicial 10000 USDT, taxa 0,1% e slippage 0,05% por lado.

| Par | Estratégia | Líquido sem o analista (USDT) | Líquido com o analista (USDT) | Diferença | Taxas sem | Taxas com | Taxas poupadas | Operações sem | Operações com | Evitadas | Maior queda sem | Maior queda com | Porta fechada |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LINKUSDT | Placar clássico | −5.072,39 (−50,72%) | −1.427,48 (−14,27%) | 36,45 p.p. | 3.440,75 | 1.148,94 | 2.291,81 | 641 | 127 | 514 | 51,56% | 15,35% | 94,31% |
| LINKUSDT | Reversão | −4.695,75 (−46,96%) | −1.036,57 (−10,37%) | 36,59 p.p. | 3.193,05 | 988,39 | 2.204,67 | 483 | 96 | 387 | 48,07% | 12,56% | 94,55% |
| BNBUSDT | Placar clássico | −8.138,21 (−81,38%) | −400,18 (−4,00%) | 77,38 p.p. | 6.110,27 | 208,00 | 5.902,27 | 683 | 17 | 666 | 81,54% | 4,69% | 98,97% |
| BNBUSDT | Reversão | −7.288,29 (−72,88%) | −199,34 (−1,99%) | 70,89 p.p. | 5.352,46 | 232,49 | 5.119,97 | 543 | 19 | 524 | 73,27% | 4,26% | 99,18% |
| BTCUSDT | Placar clássico | −8.682,19 (−86,82%) | −174,97 (−1,75%) | 85,07 p.p. | 5.514,59 | 128,91 | 5.385,67 | 676 | 11 | 665 | 86,86% | 2,68% | 99,32% |
| BTCUSDT | Reversão | −7.560,25 (−75,60%) | −153,36 (−1,53%) | 74,07 p.p. | 5.855,42 | 131,61 | 5.723,81 | 549 | 11 | 538 | 76,05% | 2,66% | 99,42% |
| ETHUSDT | Placar clássico | −8.330,36 (−83,30%) | −689,71 (−6,90%) | 76,41 p.p. | 5.204,87 | 610,17 | 4.594,70 | 650 | 53 | 597 | 83,52% | 7,98% | 97,79% |
| ETHUSDT | Reversão | −7.092,12 (−70,92%) | −397,28 (−3,97%) | 66,95 p.p. | 5.778,82 | 511,48 | 5.267,33 | 543 | 42 | 501 | 71,26% | 5,18% | 98,10% |

| Par | Estratégia | Semanas | À frente | Atrás | Iguais | Veredito (D11) |
| --- | --- | --- | --- | --- | --- | --- |
| LINKUSDT | Placar clássico | 26 | 20 | 6 | 0 | ajudou: terminou à frente em 20 de 26 semanas com diferença (Wilson 95%: 57,95% a 88,97%), acima da moeda ao ar |
| LINKUSDT | Reversão | 26 | 20 | 6 | 0 | ajudou: terminou à frente em 20 de 26 semanas com diferença (Wilson 95%: 57,95% a 88,97%), acima da moeda ao ar |
| BNBUSDT | Placar clássico | 26 | 24 | 2 | 0 | ajudou: terminou à frente em 24 de 26 semanas com diferença (Wilson 95%: 75,86% a 97,86%), acima da moeda ao ar |
| BNBUSDT | Reversão | 26 | 23 | 3 | 0 | ajudou: terminou à frente em 23 de 26 semanas com diferença (Wilson 95%: 71,02% a 96,00%), acima da moeda ao ar |
| BTCUSDT | Placar clássico | 26 | 25 | 1 | 0 | ajudou: terminou à frente em 25 de 26 semanas com diferença (Wilson 95%: 81,11% a 99,32%), acima da moeda ao ar |
| BTCUSDT | Reversão | 26 | 23 | 3 | 0 | ajudou: terminou à frente em 23 de 26 semanas com diferença (Wilson 95%: 71,02% a 96,00%), acima da moeda ao ar |
| ETHUSDT | Placar clássico | 26 | 23 | 3 | 0 | ajudou: terminou à frente em 23 de 26 semanas com diferença (Wilson 95%: 71,02% a 96,00%), acima da moeda ao ar |
| ETHUSDT | Reversão | 26 | 22 | 4 | 0 | ajudou: terminou à frente em 22 de 26 semanas com diferença (Wilson 95%: 66,47% a 93,85%), acima da moeda ao ar |

Postura do analista nas velas (com o analista governando a carteira em memória):

- LINKUSDT · Placar clássico: pausa 86,48% · cautela 12,86% · moderada 0,35% · liberada 0,32%. Motivos mais comuns: move_cost 14429, no_forecast 2284, quiet_market 325, daily_loss 291. Comandos: halt 494, resume 493, exit_position 105. Falhas do analista: 0.
- LINKUSDT · Reversão: pausa 86,85% · cautela 12,60% · moderada 0,28% · liberada 0,27%. Motivos mais comuns: move_cost 14011, no_forecast 2226, daily_loss 845, quiet_market 328. Comandos: halt 476, resume 475, exit_position 75. Falhas do analista: 0.
- BNBUSDT · Placar clássico: pausa 97,64% · cautela 2,36% · moderada 0,00% · liberada 0,00%. Motivos mais comuns: move_cost 17097, no_forecast 420, daily_loss 179, quiet_market 41. Comandos: halt 83, resume 82, exit_position 14. Falhas do analista: 0.
- BNBUSDT · Reversão: pausa 98,00% · cautela 2,00% · moderada 0,00% · liberada 0,00%. Motivos mais comuns: move_cost 16980, no_forecast 353, daily_loss 284, quiet_market 43. Comandos: halt 70, resume 69, exit_position 13. Falhas do analista: 0.
- BTCUSDT · Placar clássico: pausa 98,44% · cautela 1,56% · moderada 0,00% · liberada 0,00%. Motivos mais comuns: move_cost 17370, no_forecast 277, daily_loss 89, quiet_market 13. Comandos: halt 51, resume 50, exit_position 8. Falhas do analista: 0.
- BTCUSDT · Reversão: pausa 98,71% · cautela 1,29% · moderada 0,00% · liberada 0,00%. Motivos mais comuns: move_cost 17314, no_forecast 228, daily_loss 98, quiet_market 20. Comandos: halt 49, resume 48, exit_position 8. Falhas do analista: 0.
- ETHUSDT · Placar clássico: pausa 94,80% · cautela 5,11% · moderada 0,08% · liberada 0,01%. Motivos mais comuns: move_cost 16491, no_forecast 908, daily_loss 220, quiet_market 77. Comandos: halt 194, resume 193, exit_position 45. Falhas do analista: 0.
- ETHUSDT · Reversão: pausa 95,28% · cautela 4,63% · moderada 0,08% · liberada 0,01%. Motivos mais comuns: move_cost 16352, no_forecast 818, daily_loss 378, quiet_market 67. Comandos: halt 186, resume 185, exit_position 32. Falhas do analista: 0.

Dos 8 casos (4 pares × 2 estratégias): ajudou em 8, atrapalhou em 0, empatou em 0 e ficou com poucas semanas em 0. Somando os 8 casos, o líquido com o analista menos o líquido sem ele é 52.380,67 USDT (saldo inicial de 10000 USDT por caso). O veredito mede só se o analista perde MENOS que a estratégia sozinha, não se ganha: com o analista o líquido ficou positivo em 0 dos 8 casos e negativo em 8, ou seja, pior que não operar (líquido zero) em 8.

### O que o relatório diz, sem esconder nada

1. **O veredito D11 é `ajudou` nos 8 casos** (o analista terminou à frente em 20 a 25 de 26 semanas; limite inferior do Wilson de 57,95% a 81,11%). **Mas "ajudou" aqui é perder MENOS que a estratégia sozinha, não ganhar:** com o analista o líquido ficou **negativo nos 8 casos** (−1,53% a −14,27% do saldo em 183 dias) e, portanto, **pior que não operar** (líquido zero). A estratégia sozinha perde 47% a 87% do saldo em 15 min (taxas de 3,2 a 6,1 mil USDT sobre 10 mil em 483 a 683 operações): o analista não acerta mercado, ele para de queimar taxa.
2. **De onde vem a ajuda:** a trava `move_cost` (o movimento típico de 15 min, o ATR em %, tem de pagar pelo menos o dobro da ida e volta, 0,6%) é o motivo mais comum em todos os casos e a porta fica fechada em **94% a 99% das velas**. Postura MODERADA ou LIBERADA soma no máximo 0,67% das velas em LINK, 0,09% em ETH e 0,00% em BNB e BTC; o grosso é PAUSA (86% a 99%) e CAUTELA. Ou seja: nesta janela o analista é, na prática, "não operar em 15 min porque o custo come o movimento". É a resposta honesta que a spec previa (§8) e coerente com a T0.2 (o Placar clássico acerta menos que a moeda ao ar em 15 min).
3. **O que NÃO está medido:** o tamanho do analista (¼ e ½ do risco) não entra, porque o motor só ganha o comando de tamanho na Fase 4 (T4.1, mudança de motor): nas velas em CAUTELA ou MODERADA com a porta aberta a operação roda no tamanho cheio da estratégia. O contrafactual também não vê o que o analista faria com a meta (`goal`) nem com `waitingForData`.
4. **Ordem de grandeza para o usuário decidir o `govern` (D1):** governar tira a perda de taxa, mas não cria ganho; com as estratégias e as taxas de hoje a simulação de 15 min continua perdendo em todos os pares. A decisão de liberar o modo `govern` (Fase 4) fica com o usuário; a evidência acima NÃO é uma recomendação de operar.
5. **Conferências:** zero falhas do analista nas 17.568 velas × 8; a estratégia sozinha bate com o laço direto do motor (patrimônio final e número de entradas) no recorte de 900 velas do teste; o analista sem comandos de entrada (só `halt`, `resume`, `exit_position`).

```text
bun run typecheck    → verde
bun run lint         → verde
bun run format:check → All matched files use Prettier code style!
bun test test/analyst-counterfactual.contract.test.ts → 19 pass / 0 fail
```

## T3.1 — rotas do analista e votos por regra (2026-10-16)

- **Rotas** (`apps/api-ativada/src/runs/analyst/`): `GET /v1/runs/:runId/analyst` e `/analyst/decisions?cursor=&limit=`, `access: USER`, `documentation`
  (Zod de entrada e de saída no OpenAPI), política `RUN_LIVE_STATUS` (cinco rotas no balde de 60/min). As frases saem do catálogo da A17 do
  `@ativada/risk-analyst` sobre a linha gravada pelo worker; nada é recalculado por pedido. Detalhe da forma e dos desvios no ADR 0002
  ("T3.1 — as rotas do analista como ficaram"). A API passou a depender do pacote (`package.json` e `bun.lock`, workspace).
- **Consultas:** `/analyst` = 3 sem meta (execução, versão, última decisão) e 4 com meta (`readAnalystGoalSnapshot`: o último patrimônio e as
  operações fechadas numa consulta só); `/analyst/decisions` = 3. Novo no repositório de dono: `readAnalystGoalSnapshot` (sem migration), com
  checagem no `database-test` e no `route-isolation-test` (`analyst-reads-checks.ts`).
- **Contrato** (`test/api-run-analyst.contract.test.ts`, 29 testes, `loadApiApp()` + repositório em memória): feliz em sombra com as frases IGUAIS às
  do dourado `analyst-1` (postura, motivo, ritmo, travas, tabela da equipe, aviso fixo), sem vela, aquecendo, simulação parada, esperando velas,
  encerrada, última vela com falha (frase de falha, sem o código nem o texto do erro), meta somada (+3,00% em 1 operação, falta 7,00%), histórico por
  cursor sem repetir nem pular, `failed` só com o código estável, `404` igual (outro usuário, inexistente, apagada, malformada), `401`, `409
  RUN_NOT_LIVE` (backtest e walk-forward), `409 ANALYST_NOT_ENABLED`, `400` sem eco de valor (todos os erros de uma vez), ≤ 4 consultas e o balde de 60/min.
- **Mutantes de dono:** `scripts/api-runs-mutants.ts` ganhou +2 (`ANALYST_DECISIONS_READ_EVERY_OWNER`, `ANALYST_GOAL_SNAPSHOT_READS_EVERY_OWNER`): `make
  api-runs-mutants` (Postgres embutido do WSL, porta 56441, cópia do espelho) → `api-runs-mutants: OK - 30 mutantes de filtro de dono reprovados`.
- **D4-A da spec 011 (motivo por regra) FEITA como mudança aditiva:** `ruleVotes` em `VoteReading`/`SpecialistView` (gravado no `jsonb specialists`, sem
  migration), `describeSpecialistMotive` com o catálogo de 7 regras × 3 frases + 3 extras, `motive` por especialista na resposta. **Dourado `analyst-1`
  regravado SEM mudar número:** comparado com o anterior depois de tirar o campo `ruleVotes`, 12 casos, 0 diferentes, 48 campos novos. Contrato
  `test/risk-analyst-specialist-motive.contract.test.ts` (11): tabela da §5 literal, igualdade com `describeRuleCondition` da 008, escolha da regra,
  anulação, sem leitura, os 3.300 candles reais de 15 min e o corte da série no meio; 6 mutantes novos (58 no total, todos mortos, controle verde).

Gates (WSL, espelho próprio `~/gates/ativada-spec7`, rodadas longas na cópia `ativada-spec7-run`):

```text
bun run typecheck    → verde (tsc raiz e painel)
bun run lint         → verde
bun run format:check → All matched files use Prettier code style!
bun test (api-*, ownership*, risk-analyst-*, live-analyst-*, app-import-boundary, code-size-limits, strategy-engine-boundary, database.contract) → 1194 pass / 0 fail
test/risk-analyst-mutants.contract.test.ts → 60 pass / 0 fail (58 mutantes mortos, controle verde)
db:database-test + route-isolation-test (Postgres embutido) → OK
scripts/api-runs-mutants.ts → OK - 30 mutantes de filtro de dono reprovados
```
