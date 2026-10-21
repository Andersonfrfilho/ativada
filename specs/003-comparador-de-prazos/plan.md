# Plano — Spec 003

## D1. Onde mora cada peça

| Peça | Lugar | Por quê |
|---|---|---|
| Janelas de N dias sem alvo | `packages/strategy-engine/src/horizon/` (`computeHorizonWindows`, puro) | Reaproveita `computeGoalSignals` e o leitor de trajetória de `goal/goal-trajectory.ts`; nenhuma carteira nova (RNF02) |
| Resumo da linha (mediana, % positivas, pior 10%) | `horizon/summarize-horizon.ts` (puro, `EngineDecimal`) | Testável com contas à mão |
| Regra de recomendação | `horizon/recommend-horizon.ts` + `horizon.constant.ts` (`HORIZON_DAYS = [7, 15, 30]`, limiares do §5) | Um lugar só para a regra |
| Linha de 15 min | `horizon/summarize-intraday.ts`: recebe as métricas de um backtest (`computeRunMetrics`) e devolve líquido, operações, taxas e a fração taxa/ganho bruto | O backtest já calcula tudo isso; aqui é só a leitura |
| Execução da linha de 15 min | API: roda o passo do backtest em memória (`advanceCandle` de `@ativada/run-recording`) sobre 90 dias de 15m, **sem gravar** `runs` | Não enche a fila nem o banco; mesmo código do backtest |
| Rota | `apps/api-ativada/src/horizons/` — `GET /v1/horizons?symbol=&strategyId=` | Recurso de leitura; `strategyId` opcional (sem ele: as 5 mais novas, vence a melhor por linha) |
| Pool e portão | Reusa `goal-evaluation-pool.ts` e `goal-cold-gate.ts` com um novo tipo de tarefa | RNF01 sem infraestrutura nova |
| Frases | `apps/api-ativada/src/horizons/horizon-messages.ts` | RF06: o servidor escreve, o painel só exibe |
| Tela | `apps/frontend-ativada/src/horizons/` (`HorizonsPage.page.tsx`, `HorizonRow.component.tsx`, `horizon.query.ts`, `horizon.validation.ts`) | Padrão das outras telas |

## D2. Janela sem alvo (o ponto delicado)

`simulateGoalWindows` encerra a janela no alvo ou na perda máxima. Para o comparador a janela vai até o fim. Em
vez de copiar o laço, extrair de `goal-windows.ts` a parte comum — "próxima compra a partir do candle" e
"trajetória da carteira que entrou naquele candle" — numa função que as duas usam. A classificação
(`classifyGoalWindow`) continua só nas metas. O retorno da janela é `equity(fim) / saldo − 1`; carteira que nunca
comprou dá retorno 0 (conta como não positiva).

Comprar e segurar: o mesmo `createBenchmarkReader` das metas, lido no fim da janela.

## D3. Percentil sem float

Ordenar os retornos como `EngineDecimal`, percentil 10 pelo método "nearest-rank" (`ceil(0,1 × n)`-ésimo menor).
Mediana: média dos dois do meio para `n` par, a 8 casas, arredondada para baixo.

## D4. Cache e custo

Chave `(strategyVersionId, symbol, lastDailyCandle, last15mCandle)`. Custo a frio por estratégia e par: 1 série
diária (~730 velas) + 90 dias de 15 min (~8.640 velas). Com 5 estratégias, cabe no orçamento do pool; o portão
cobra uma unidade do `GOAL_EVALUATION_COLD` por pedido a frio.

## D5. Mudanças já feitas fora de spec (entram aqui para ganhar teste e commit)

Feitas em 2026-10-12 durante o teste local, sem commit:

1. **Tick e passo por par** (`apps/api-ativada/src/runs/runs.constant.ts` `EXCHANGE_FILTERS_BY_SYMBOL`, usado em
   `create-run-request.schema.ts` e `goals/goal-evaluation-series.ts`). Sem isso, PEPE e SHIB arredondam o preço
   para zero com o tick padrão de 0,01. Falta: contrato provando que PEPEUSDT recebe tick `0.00000001`, que BTC
   continua com o padrão do motor (hash da execução inalterado) e que o valor enviado pelo usuário ainda vence.
   Melhor ainda: mover a tabela para `packages/market-data-crypto` (é dado de mercado) e ler os filtros reais da
   Binance (`exchangeInfo`) no backfill — decidir na T0.1.
2. **Visual do painel** (ícones no menu `layout/Icon.component.tsx`, fontes, selects com seta própria, dicas nos
   campos da meta via `hint` em `forms/Fields.component.tsx`). Falta: contrato do `hint` (`aria-describedby`) e
   conferência de contraste nos dois temas.

## D6. Testes conhecidos quebrados no Windows

`test/fixtures/api-routes/*` e o `service-worker.contract` do painel falham no Windows por caminho `/C:/...`
(`new URL(...).pathname`), o mesmo defeito do `MIGRATIONS_FOLDER`. Não é desta spec; registrar em `evidence.md`
e rodar os gates no Linux/WSL.
