# Plano — Spec 013

Fatos conferidos em 2026-10-16 (não repetir a busca):

- **Entrada do motor** (`packages/strategy-engine/src/wallet/entry-order.ts`, `placeEntry`): só entra livre (sem posição,
  sem pendente, sem `halt`); escala `'0'` (A21) sai em silêncio; ATR ausente ou ≤ 0 → ordem `rejected` / `zero_atr`; risco
  ≤ 0 → `rejected` / `below_min_notional`; senão cria a ordem com `riskAmount`, `stopDistance = stopAtrMultiple × ATR(t)` e
  `targetDistance = targetAtrMultiple × ATR(t)` (ATR por `decimalFromIndicator` de `signal.indicators[RISK_ATR_INDICATOR_ID]`).
  O preço de verdade nasce no preenchimento (`computeProtectivePrices`, `risk/protective-prices.ts`).
- **Recusa = ordem gravada.** `rejectEntry` chama `takeKey(draft, 'order')` e `recordOrder(... REJECTED, reason)`: uma recusa
  consome uma chave de ordem (as chaves seguintes mudam — só nas execuções com o campo, então nada antigo muda).
- **Vocabulário** (`engine-vocabulary.constant.ts`): `ORDER_EVENT_REASON` = `below_min_notional`, `zero_atr`, `invalid_stop`,
  `opposite_signal`, `command`, `gap`, `volume_capped`. A cópia do banco é `ORDER_REASON` em
  `packages/database/src/run-results/run-result.constant.ts`, presa pelo `CHECK` `orders_reason_check`
  (`orders.reason varchar(32)`): **motivo novo = migration**. Última migration: `0025_run_commands_analyst`.
- **`RunParameters`** (`run-parameters.schema.ts`): `z.strictObject` com `schemaVersion`, par, timeframe, fonte de
  sentimento, saldo, `feeRate` (padrão 0,001, teto 0,01), `slippageRate` (0,0005, teto 0,05), filtros e `maxVolumeShare`;
  8 casas no máximo. Entra no `runHash` (SHA-256 do JSON canônico). `runs.run_parameters` é `jsonb`: campo novo **não** pede
  migration. A API aceita só os campos de `runParametersBodySchema` (`apps/api-ativada/src/runs/create-run-setup.ts`).
- **Estratégia** (`strategy-config.schema.ts`, `RISK_SCHEMA`): `atrPeriod` 14, `stopAtrMultiple` 2, `targetAtrMultiple` 3,
  `riskPerTrade` 0,01, `maxExposureRate` 1 (Placar clássico igual). Entra no `configHash`.
- **`entryRiskScale`** (spec 007, ADR 0002 A21): opcional em `StepInput`/`WalletStepInput`, `'0' | '0.25' | '0.5' | '1'`,
  fora dos hashes, vale só para a entrada daquele passo; `advanceCandle` repassa. Sem `ENGINE_VERSION` novo (dourado
  `engine-2` idêntico).
- **Analista** (`packages/risk-analyst`): `market-readings.ts` calcula `roundTripCost = 2 × (taxa + slippage)` e `moveToCost =
  atrRate ÷ custo`; `risk-locks.ts` `computeMoveCost` fecha a porta com `atrRate < minimumMoveToCost (2) × custo`
  (`ANALYST_RULES.minimumMoveToCost = '2'`); a frase está em `analyst-messages.ts`. **Outro executor está na Fase 4 da 007
  (worker/API): não tocar em `packages/risk-analyst`, `apps/worker-ativada/src/live/analyst*`, `govern-*` nem nos testes
  `live-analyst-*` até a 007 fechar.**
- **Decisões da 008** (`apps/api-ativada/src/runs/live-status/`): `DECISION_OUTCOME` = `waited`, `bought`, `buy_pending`,
  `sold`, `exited`; compra não executada sai como `Sinal de compra sem execução.` (`decision-messages.ts`); o estado da vela
  vem só de `positions` (`decision-candle-state.ts`); `signals.indicators` é `jsonb` (tem o ATR de risco de `t`); teto de 5
  consultas por pedido no `live-status`.
- **Spec 003**: `summarizeIntraday` diz `NAO_COMPENSA` quando o líquido ≤ 0 ou as taxas passam de 50% do bruto.

## D1. Onde mora a regra (as três opções)

| | A — `RunParameters` + checagem no `placeEntry` (recomendada) | B — campo da estratégia (`risk.minimumNetTargetRate`) | C — entrada por passo (`entryRiskScale: '0'`) |
|---|---|---|---|
| Hash | muda o `runHash` só de execução com o campo | muda o `configHash` só de versão com o campo; editar cria versão nova | nenhum (fora dos hashes) |
| Execuções e versões existentes | intactas (campo ausente = antigo) | intactas (campo ausente = antigo) | intactas |
| Mesma estratégia com e sem mínimo | sim, duas execuções | não: duas versões | sim |
| Custo e mínimo no mesmo lugar | sim (taxa e slippage já são `RunParameters`) | não (custo na execução, mínimo na estratégia) | o chamador junta os dois |
| Backtest, walk-forward e ao vivo | automático: o motor decide | automático | cada chamador (`advanceCandle`, walk-forward por janela) precisa calcular antes do passo — e o ATR só existe DEPOIS do `signalStep`: `advanceCandle` teria de partir o `step` em dois |
| Registro | ordem recusada com motivo (D3-A) | idem | silencioso (a escala `'0'` não grava nada) |
| Walk-forward ajusta o mínimo | não | poderia (catálogo novo) | não |
| Muda o motor | **sim** (schema + `placeEntry` + vocabulário) | **sim** | não |
| Reversão | campo novo é recusado por código velho: ordem de deploy (RNF06) | idem, e versões novas não abrem em código velho | trivial |

**Recomendação: A.** A regra compara o alvo com o CUSTO DA EXECUÇÃO, e o custo é `RunParameters`; pôr o mínimo ao lado
mantém a pergunta inteira num objeto só, com hash próprio, sem versão nova de estratégia e com o registro da recusa. C não
muda o motor, mas espalha a regra por chamadores (lógica duplicada entre backtest e ao vivo é defeito pela regra do repo) e
deixa a recusa invisível. **Mudar o motor exige autorização explícita** (spec §9, item 1): sem ela a execução faz a Fase 0 e
para.

## D2. A regra `minimum-profit-1` (fechar na T0.1)

- Função pura exportada pelo motor, em `packages/strategy-engine/src/risk/entry-profit-edge.ts`:
  - `computeRoundTripCostRate({ feeRate, slippageRate })` = `2 × (feeRate + slippageRate)`, exato.
  - `computeEntryProfitEdge({ atr, close, targetAtrMultiple, feeRate, slippageRate })` →
    `{ grossTargetRate, roundTripCostRate, netTargetRate }` em TEXTO, `grossTargetRate = targetAtrMultiple × ATR ÷ close`
    com divisão a 12 casas para BAIXO (como o `atrRate` do analista) e as somas exatas.
  - `isEntryProfitable({ edge, minimumNetTargetRate })` = `netTargetRate ≥ minimum` (igual passa), comparação em decimal.
- `ATR` entra por `decimalFromIndicator` (a MESMA conversão da `targetDistance`); `close` é o fechamento de `t`. Ordem a
  mercado e ordem limitada usam o mesmo fechamento (a limitada compra mais barato, então a regra fica do lado conservador).
- **Ordem das checagens em `placeEntry`:** carteira livre → escala `'0'` em silêncio → ATR ausente/zero (`zero_atr`) →
  **lucro mínimo** (`below_minimum_profit`, só se o campo existir) → risco ≤ 0 (`below_min_notional`) → cria a ordem. Assim
  a pausa do analista continua silenciosa e não vira recusa em dobro.
- `RUN_PARAMETERS_SCHEMA` ganha `minimumNetTargetRate: decimalTextSchema({ minimum: '0', maximum: '0.1',
  maximumDecimalPlaces: 8 }).optional()` — **sem `.default`**, para o JSON canônico de execução antiga não ganhar a chave.
  `RUN_PARAMETERS_SCHEMA_VERSION` não muda (campo opcional; a T0.1 confirma com o arquiteto).
- `ENGINE_VERSION` não muda se o dourado `engine-2` ficar idêntico (precedente A21); a T0.1 registra no ADR a decisão e o
  porquê. `SIGNAL_ENGINE_VERSION` não muda (o sinal não é tocado).
- `warnRunParameters`: `minimum_profit_below_cost` (mínimo < custo de ida e volta) e `no_minimum_profit_short_candle`
  (timeframe `15m` sem o campo).

## D3. Registro e banco

- `ORDER_EVENT_REASON.BELOW_MINIMUM_PROFIT = 'below_minimum_profit'` no motor e em `ORDER_REASON` do banco.
- Migration `00NN_orders_minimum_profit` (número livre na hora): recria `orders_reason_check` com o valor novo (`NOT VALID` +
  `VALIDATE`), como a `0025`; `.rollback.sql` ABORTA se existir `orders.reason = 'below_minimum_profit'`.
- `GET /v1/runs/:id`: `runParameters.minimumNetTargetRate` (como os outros parâmetros) e `minimumProfit: { skippedEntries }`
  (`count(*)` em `orders` do dono com esse motivo; o índice de `orders` por execução já existe — conferir o plano da
  consulta). `null` quando a execução não tem o campo.

## D4. Analista (spec 007) — compor sem duplicar

- O analista decide a ESCALA (A21); o motor, com escala ≠ `'0'`, confere o lucro mínimo. Nada no analista muda nesta spec
  (D4-A); a T4.2 (depois que a 007 fechar) troca o `2 × (taxa + slippage)` de `market-readings.ts` pelo
  `computeRoundTripCostRate` do motor, com o dourado `analyst-1` idêntico (um lugar só para o custo).
- **Por que não há bloqueio em dobro no padrão:** a porta do analista abre só com `ATR% ≥ 2c` (`c` = custo de ida e volta).
  Então `ganho líquido = m × ATR% − c ≥ (2m − 1) × c`. Com `c = 0,3%`, isso é ≥ 0,6% para `m ≥ 1,5`. O Placar clássico tem
  `m = 3` (≥ 1,5%): com o analista governando e o custo padrão, a regra a 0,6% nunca barra a mais. Sem o analista, ela é a
  única trava. As duas coincidem só num caso particular: `move_cost` equivale a esta regra com `minimum = (2m − 1) × c`
  (1,5% com `m = 3` e o custo padrão). Fora dele medem coisas diferentes (`move_cost` olha o movimento típico, esta olha o
  alvo da operação); por isso ficam as duas, documentadas no ADR.
- Na sombra o analista não muda a simulação; a regra do lucro mínimo, sim (ela é da execução).

## D5. API

- `runParametersBodySchema` ganha `minimumNetTargetRate` (texto, `max(TEXT_MAXIMUM)`, opcional); o valor é conferido pelo
  esquema do motor como os outros (erro com caminho `runParameters.minimumNetTargetRate`, sem eco).
- `DECISION_OUTCOME.WAITED_MINIMUM_PROFIT = 'waited_minimum_profit'`: BUY livre sem posição na abertura seguinte **e** com
  ordem `rejected`/`below_minimum_profit` naquela vela. O estado da vela (`decision-candle-state.ts`) passa a ler também as
  recusas da janela das decisões; a T0.1 decide se isso cabe numa consulta existente (as posições) ou se é a 5ª consulta
  (o teto é 5 por pedido).
- Frase fechada (catálogo `decision-messages.ts`, sem data nem hora): `Esperou: o ganho possível até o alvo (X%) não paga o
  custo de ida e volta (Y%) mais o lucro mínimo que você pediu (Z%).` X de `computeEntryProfitEdge` com o ATR de
  `signals.indicators`, o fechamento da vela e o `targetAtrMultiple` da versão; X para BAIXO, Y e Z para CIMA, 2 casas.
  Leitura de ATR ausente (sinal antigo) = frase sem números: `Esperou: o ganho possível até o alvo não pagava o custo mais o
  lucro mínimo.`
- `/log.csv` já traz `reason` das ordens: nada a mudar além do valor novo.
- OpenAPI (`*.docs.ts`) e o esquema Zod do painel acompanham.

## D6. Painel

- `BacktestFields.component.tsx` / `backtest-form.validation.ts` e a criação da simulação ao vivo (perto do
  `SimulationTimeframePicker`): componente `MinimumProfitField` (caixa "Usar lucro mínimo" + campo em %, padrão `0,6`) e
  `RoundTripCostNote` ("Cada compra e venda custa cerca de **0,30%**…", calculado de `feeRate`/`slippageRate` do formulário em
  `BigInt` escala 8, para CIMA).
- Detalhe da execução (`CostsCard` ou vizinho): "Lucro mínimo por operação: 0,6%" / "não usado" e "Compras que a regra
  barrou: N".
- `DecisionsTable`: o desfecho novo com ícone + palavra ("Esperou") + a frase do servidor.
- Glossário: `minimumProfit` — "O quanto a operação precisa ganhar no alvo, já sem as taxas, para a simulação comprar. Não
  garante lucro."

## D7. Provas

| Prova | O quê |
|---|---|
| Dourado (identidade) | `engine-2` dos conjuntos reais idêntico; `runHash` literal de `classic-scoreboard.run.json` idêntico; dourado `analyst-1` idêntico |
| Dourado (novo) | `classic-scoreboard-engine-minimum-profit.engine-2.json`: Placar clássico nos três conjuntos reais (BTC 1 h, ETH 1 d, BTC 15 min do analista) com 0,3%, 0,6% e 1,0%; script `scripts/record-engine-minimum-profit-golden.ts` |
| Contas à mão | 6 casos de borda: líquido igual ao mínimo (passa), 1e-12 abaixo (barra), mínimo 0 com alvo abaixo do custo (barra), ordem limitada, escala `'0'` + mínimo (silêncio, sem recusa), ATR zero (continua `zero_atr`) |
| Diferencial | oráculo independente em `test/fixtures/strategy-engine/minimum-profit/` (TS puro, sem importar `src`, `bigint` escala 12) contra `computeEntryProfitEdge` em ≥ 3.000 sorteios, e o oráculo `bigint` de carteira (`oracle-bigint/`) estendido para a recusa nos fluxos reais |
| Propriedade (2.000 sorteios) | toda entrada criada tem líquido ≥ mínimo; nenhuma saída muda de vela; sem o campo = mesmos `fills` byte a byte; mínimo maior nunca cria entrada que um menor recusaria NA MESMA VELA com o mesmo estado |
| Harness | `runEngineContract` (21 verificações, 10 cenários) com o campo ligado; cortes `no-lookahead` e `resume` |
| Paridade | `make backtest-test`, `make live-test` e `make walkforward-test` com uma execução de campo ligado nos conjuntos reais |
| Mutantes (≥ 12) | `≥` trocado por `>`; custo de um lado só; taxa sem slippage; alvo pelo `stopAtrMultiple`; ATR de `t+1`; fechamento de `t+1`; divisão para cima; checagem antes da escala `'0'` (recusa em dobro); checagem na saída; motivo trocado por `zero_atr`; campo com `.default` (hash antigo muda); recusa sem `takeKey` |
| API | contrato do `POST` (aceita, `400` sem eco, teto 0,1), do `GET` (campo e contagem, contrato negativo entre usuários) e da frase (literal, arredondamento); mutantes da frase e do filtro de dono |
| Painel | contrato do campo (padrão, desligar, custo calculado, `percentToFraction`), da linha "Esperou", glossário, 375 px, contraste, alvos de 44 px |

## D8. Medição (T0.2)

- Estender `scripts/minimum-edge-estimate.ts` (já mede os conjuntos de `test/fixtures/`) com o recorte da 007: os mesmos
  183 dias de 15 min dos 4 pares, lidos só por `SELECT` (`createCandleRepository(...).findCandles`, como o
  `scripts/analyst-counterfactual.ts`), Placar clássico e Reversão, mínimos 0 / 0,3% / 0,6% / 1,0%: operações, taxas,
  líquido, maior queda pelo vale. Antes e depois, `--counts` (só `SELECT`) prova que nada foi gravado.
- **Para e pergunta** se, a 0,6%, as taxas de 15 min não caírem pelo menos 50% em algum par, ou se o resultado de 1 h piorar.

## D9. Deploy e reversão

Banco (CHECK) → worker → API (aceita o campo) → painel (pré-preenche). Reversão: painel → API (recusa o campo) → encerrar as
execuções com o campo (código velho não lê o `RunParameters` delas) → worker → banco (o rollback aborta enquanto houver
recusa gravada).
