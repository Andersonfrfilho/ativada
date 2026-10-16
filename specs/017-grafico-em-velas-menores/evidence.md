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

## T1.1 — constantes e fronteira (commit c2b7561)

- Constantes: `DISPLAY_TIMEFRAME` (`3m`), `MARKET_CANDLE_TIMEFRAME`, `MARKET_CANDLE_DURATION_MILLISECONDS`, `isDisplayTimeframe`
  (mercado); `RUN_CANDLE_TIMEFRAMES`, `DISPLAY_CANDLE_TIMEFRAMES`, `CANDLE_TIMEFRAMES` (banco). `TIMEFRAME`, `ENGINE_TIMEFRAME` e
  `RUN_TIMEFRAMES` não mudaram.
- `test/display-timeframe-boundary.contract.test.ts` (9 testes): interseção vazia, `MARKET_TIMEFRAMES` recusa `3m`,
  `POST /v1/runs` com `3m` = 400 (backtest e live_paper), esquema do corpo recusa `3m` mesmo habilitado por engano, sonda de
  importação nos 8 diretórios do motor, ligação `isCandleTimeframe(run.timeframe)` nas três bases.
- Mutantes da fronteira: `3m` em `RUN_TIMEFRAMES` (morto), guarda `isCandleTimeframe` removida no ao vivo (morto) e no backtest
  (morto), menção a `MARKET_DISPLAY_TIMEFRAMES` em `worker/src/live` (morto), `3m` na lista `MARKET_TIMEFRAMES` do ambiente
  (morto). Mutante "esquema do corpo aceita `3m`" sobrevive POR DESIGN: há uma segunda barreira dentro da transformação do
  corpo (o erro do `timeframe` continua), então um único defeito não basta.
- `test/api-markets-display.contract.test.ts`: 3m aceita com `meta.retentionStart` alinhado à grade; vela de execução mantém o
  corpo antigo (`{ data }`); teto de 5.000 velas contado em 3m; `5m` e `3m` desabilitada = 400.
- Vizinhos verdes (542 testes em 47 arquivos): strategy-engine-boundary, timeframe-tables, ownership-registry, api-markets,
  api-openapi, cron/worker/api environment, kline-stream, ticker, market-*, backfill, code-size-limits, app-import-boundary.
  `database.contract` reprova a lista de exportações públicas por `EXIT_REASON`, `NOTICE_*`, `ORDER_*` e
  `createNoticeFeedRepository` (spec 014, já no HEAD; fora desta spec). `ticker-mutants` falhou uma vez sob carga (mutante
  `NEW_TICK_DOES_NOT_CLEAR_THE_SEAL`, temporização) e passou isolado.

## T2.1 — migration 0026

- `0026_candles_display_timeframes.sql`: recria `candles_timeframe_check` com `3m` (`NOT VALID` + `VALIDATE`); snapshot e
  journal gerados pelo `drizzle-kit generate` num espelho. O `CHECK` aceita SÓ `3m` (`1m`/`5m` não foram autorizados; o teste
  prova que `5m` é recusada, código 23514).
- `.rollback.sql` ABORTA (`restrict_violation`) com qualquer linha `3m`.
- `make migration-test` equivalente no Postgres embutido do WSL (porta 56455): "27 migrations aplicadas e desfeitas", com a
  verificação nova (CHECK validado com `3m`; rollback aborta pela guarda com linha 3m; sem linha, o rollback completo passa).
  Mutante "rollback sem guarda" morto.
- `database-test` (mesmo Postgres): expurgo só de `3m` anterior ao corte (exclusivo), em lotes (3), 15m/1h/4h/1d intactos;
  mesma abertura em 3m e 15m, cada leitura traz só a sua; 5 velas de 3 min (bigint, escala 8) = a vela de 15 min (OHLCV e
  `trade_count`). Mutantes mortos: expurgo sem filtro de vela, corte `<=`, leitura sem filtro de vela, expurgo sem laço.

## T2.2 / T2.3 — cron: recarga e limpeza das velas de exibição

- `backfill-display-candles`: a mesma tarefa do backfill (sequencial por par, peso e 418 do cliente existente: o 418 aborta),
  com janela em DIAS (`computeBackfillWindow({ days })`: `ceil((agora − retenção) ÷ d) × d` até a vela em formação).
  `purge-display-candles`: `repository.purgeDisplayCandles` (lotes de 5.000, parametrizado, só `3m`, corte exclusivo). As duas
  em `TASK_NAME`/`CRON_TASKS` e em `createProductionTasks`. Env novas validadas no `marketEnvironmentShape`
  (`MARKET_DISPLAY_TIMEFRAMES`, padrão vazio, só `3m`; `CANDLE_DISPLAY_RETENTION_DAYS`, 7 a 365, padrão 90).
- `test/backfill-display-candles.contract.test.ts` (12 testes): janela de 90 dias na grade de 3 min, 43.199 velas em 44 pedidos
  de 1.000, segundo backfill sem pedido nenhum, 418 para tudo no terceiro pedido, corte da limpeza, env (padrão, faixa, nomes
  das tarefas, recusas). Mutantes mortos: corte no futuro, janela ignora dias, `days` não repassado, teto da retenção.
- Cron REAL (`scripts/display-candles-test.ts`, Postgres embutido porta 56455 + Binance falsa local, sem Docker):
  "90 dias de 3m (43199) -> 44 chamadas de 1000, peso 88", segundo backfill "zero chamadas, zero inseridas", limpeza com 7
  dias "ficaram 3359 velas 3m, 1h intacta". (`make backfill-test` NÃO foi usado: o alvo sobe Docker de teste, proibido aqui; e o
  `scripts/backfill-test.ts` já falha no HEAD no primeiro cenário, `HOLEUSDT` sem filtros de par, fora desta spec.)

## T2.4 — worker, ticker e rota

- Worker: assina `<par>@kline_3m` (a lista é `MARKET_TIMEFRAMES` + `MARKET_DISPLAY_TIMEFRAMES`) e grava só as fechadas; vela de
  exibição NÃO aciona `onCandleStored`. `test/worker-display-candles.contract.test.ts` (5): assinatura, gravação com decimais
  exatos e imutável (reentrega e reescrita não mudam a vela), vela aberta não grava, 3m não acorda a simulação (1h acorda),
  buraco de 3m na janela recuperado pelo REST. Mutantes mortos: 3m acorda a simulação, esquema do stream sem 3m.
  (Mutante da duração em `unfillable` sobrevive: só altera a contabilidade de "inalcançável".)
- Ticker da API: `test/market-stream-pipeline.contract.test.ts` +2: `kline_3m` assinado junto das velas de execução, UMA
  mensagem por par e vela (1h e 3m separadas), exibição sozinha NÃO liga a assinatura de kline. Mutantes mortos: ticker sem
  exibição, esquema do ticker sem 3m, exibição ligando o kline sozinha.
- Rota: ver T1.1 (`meta.retentionStart`, teto de 5.000 em velas de 3 min).
- Oráculo 5×3 = 15: `database-test` (bigint, Postgres embutido) e `scripts/display-candles-measure.ts` (só `SELECT`, valida
  contra o banco real; provado contra uma janela adulterada: 1 divergência `high`, saída 1).

## T2.5 — ambiente

- `envs/env.dev`: `MARKET_DISPLAY_TIMEFRAMES=3m`, `CANDLE_DISPLAY_RETENTION_DAYS=90`. `dev-lib.ps1`/`.sh` repassam
  `VITE_MARKET_DISPLAY_TIMEFRAMES` (variável NOVA; `VITE_MARKET_TIMEFRAMES` NÃO mudou, para não mexer no seletor do painel
  que outro agente edita: a Fase 3 decide como consumi-la). `docs/runbook-dev-local.md` §8.
