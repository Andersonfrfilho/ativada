# Evidência — Spec 013

## Autorização do usuário (2026-10-16)

O usuário (Anderson), sobre evitar operações de lucro baixo por causa das taxas da exchange, pediu: **"certo, add isso nas
regras para evitarmos transações nesses valores"**. Isso vale como resposta às decisões do `spec.md` §9 com as opções A e
como a **autorização registrada** que o `tasks.md` exige:

| Decisão | Resposta | O que libera |
|---|---|---|
| D1 | A — `RunParameters.minimumNetTargetRate` opcional + checagem no motor (`placeEntry`) | **mudar o motor** (Fase 1) |
| D2 | A — 0,6% pré-preenchido no painel, desligável (só depois da T0.2 registrada) | T3.1 |
| D3 | A — recusa registrada com motivo próprio (`below_minimum_profit`) | **migration ADITIVA** do `CHECK` `orders_reason_check` (só escrita e aplicada na Fase 2, T2.1) |
| D4 | A — a trava `move_cost` do analista fica como está | nada no analista antes da T4.2 |
| D5 | A — "ganho possível" = o alvo | — |
| D6 | A — prazos, metas e "O que falta para comprar" fora | — |

## T0.1 🧠 — contrato `minimum-profit-1` (2026-10-16, opus)

- **ADR 0002, seção "Lucro mínimo por operação (spec 013)"** (MP1 a MP14 e a validação): campo com `exactOptional` (conferido
  no `zod@4.6.5` que `.optional()` deixa a chave com `undefined` e o `canonicalJson` lança), fórmula sem divisão
  `m × ATR ≥ (mínimo + custo) × fechamento` com produtos num clone de 64 algarismos (a 40, a armadilha de precisão passaria
  errado: medido no `decimal.js@10.6.0`), ordem das checagens em `placeEntry`, `computeRoundTripCostRate` como lugar único do
  custo, hashes (ausente = `runHash` idêntico), **sem `ENGINE_VERSION` novo** (conferido: versão nova falharia toda simulação
  em andamento por `ENGINE_VERSION_MISMATCH`), recusa em `orders`, `live-status` continua em 5 consultas (um `EXISTS` dentro de
  `listDecisionRows`), frase fechada com X para baixo e Y, Z para cima, avisos, composição com o analista, deploy e reversão.
- **Desvios do plano registrados no ADR:** (1) `outcome` NÃO ganha `waited_minimum_profit` (RF07/plan D5): o painel publicado
  valida `outcome` com enum fechado e quebraria no deploy e na reversão; vai o campo aditivo `waitReason: 'minimum_profit' |
  null`. (2) `isEntryProfitable` recebe as entradas, não o `edge` em texto. (3) A migration da T2.1 também cria o índice
  parcial `orders_minimum_profit_idx`. (4) O oráculo mora em `test/fixtures/minimum-profit/` (a tarefa pediu esse caminho; o
  plan D7 citava `test/fixtures/strategy-engine/minimum-profit/`). (5) Frase curta quando o mínimo é exatamente 0.
- **Validação:** `architect` (opus) — APROVADO COM AJUSTES, sem bloqueio; os 6 ajustes entraram no ADR e no teste.
- **Oráculo independente** (`test/fixtures/minimum-profit/minimum-profit-oracle.ts`, `bigint`, sem `src` nem `decimal.js`) e
  `test/minimum-profit-oracle.contract.test.ts`: 8 casos à mão, a frase sem números, 3 conjuntos reais e 3.000 sorteios
  (cruzar sem divisão = líquido a 12 casas; mínimo maior nunca libera; frase sem contradição). Entradas reais gravadas por
  `scripts/record-minimum-profit-oracle-inputs.ts` em `test/fixtures/minimum-profit/real-buy-candles.json`.
- **Resultado exato nos conjuntos reais** (velas em que o Placar clássico pediu compra; barradas por mínimo 0 / 0,3% / 0,6% /
  1,0%): BTCUSDT 15 min × 3.300 — 879 pedidas, **131 / 372 / 693 / 843**; BTCUSDT 1 h × 500 — 113, **0 / 0 / 0 / 10**; ETHUSDT
  1 d × 400 — 60, **0 / 0 / 0 / 0**. Iguais à estimativa do `spec.md` §7 (que dividia e cortava a 6 casas). Novo: com mínimo 0,
  15% das compras de 15 min tinham o alvo abaixo do custo.
- **Nada mudou** em `packages/strategy-engine`, `packages/run-recording`, banco, migrations nem apps.
- **Gates** (espelho WSL `~/gates/ativada-spec13`): ver o commit da T0.1.

## Decisões do dono do produto (2026-10-16, tomadas pelo orquestrador)

1. **Telegram (RF de alerta):** a compra barrada pela regra NÃO deixa de gerar alerta, mas o texto do alerta leva o motivo
   ("Ação simulada: nenhuma — o ganho possível não paga o custo mais o lucro mínimo"), para ninguém copiar à mão a operação
   evitada. Vale para a Fase 2/4 (texto do alerta), não muda o contrato do motor.
2. **Desvio da RF07 confirmado:** `outcome: waited` + campo aditivo `waitReason: 'minimum_profit' | null`, em vez de
   `waited_minimum_profit` (o painel publicado valida `outcome` com enum fechado; ADR 0002, desvio 1 da T0.1).

## T0.2 — medição com dados reais (2026-10-16, sonnet) — ⛔ CRITÉRIO DE PARADA DISPAROU

**Script:** `scripts/minimum-profit-measure.ts` (novo; o `minimum-edge-estimate.ts` ficou como está). SOMENTE LEITURA: velas e Fear & Greed
vêm de `SELECT` pelos repositórios do repo (`readPair`/`readFearGreed` de `scripts/risk-analyst-baseline/market-source.ts`) do banco
`ativada-dev-postgres` (porta 56432; `DATABASE_URL` do `envs/env.dev` lida do ambiente, nunca impressa); nada em `src`, nenhuma escrita, nenhuma
migration, nenhum container tocado. Rodou no espelho WSL `~/gates/ativada-spec13` (50 s). `--counts` antes e depois: `runs=61 orders=48763`
nos dois momentos (nada gravado).

**Método.** Motor de PRODUÇÃO (`advanceCandle` + `createEngine`, o mesmo passo do backtest e do ao vivo), taxa e slippage padrão de
`createRunSetup` (custo de ida e volta 0,30%), sentimento real pelo `createSentimentPicker`, últimos 183 dias (15 min = 17.568 velas; 1 h = 4.392)
com o aquecimento da estratégia antes. A regra é simulada assim: em cada vela cujo sinal é de compra com ATR válido, o **oráculo `bigint` da T0.1**
(`test/fixtures/minimum-profit/minimum-profit-oracle.ts`, `isEntryAllowed`) diz se `m × ATR ≥ (mínimo + custo) × fechamento`; se não, o passo é
refeito com `entryRiskScale: '0'` (A21), como o `minimum-edge-estimate.ts`. "Pedidas (M)" = velas com sinal de compra (inclui as velas em que já
há posição, onde a compra não abre nada; igual à estimativa da T0.1). "Barradas (N)" = dessas, as que não pagam o mínimo. "Líquido" = patrimônio
final − 10.000 USDT; "Maior queda" = pelo vale (`equityAtLow`). Placar clássico = `CLASSIC_SCOREBOARD_STRATEGY`; Reversão = RSI 14 30/70 +
Bollinger 20/2 (`SPECIALIST_CATALOG.reversion`), as mesmas do contrafactual da 007.

**Cobertura:** 4 pares × 2 velas × 2 estratégias × 5 linhas (sem regra, 0, 0,3, 0,6 e 1,0%) = 80 linhas. "0,0%" barra só a compra cujo alvo nem paga o
custo.

### Tabela completa ("N de M" = Barradas de Pedidas; taxas e líquido em USDT, saldo inicial 10.000)

| Par | Vela | Estratégia | Mínimo | Compras pedidas (M) | Barradas (N) | Operações | Taxas | Líquido | Maior queda |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LINKUSDT | 15m | Placar clássico | sem regra | 4753 | - | 643 | 3455.15202187 | -5046.43013187 (-50.46%) | 51.33% |
| LINKUSDT | 15m | Placar clássico | 0.0% | 4753 | 0 | 643 | 3455.15202187 | -5046.43013187 (-50.46%) | 51.33% |
| LINKUSDT | 15m | Placar clássico | 0.3% | 4753 | 59 | 634 | 3447.7171353 | -5040.6553953 (-50.41%) | 51.27% |
| LINKUSDT | 15m | Placar clássico | 0.6% | 4753 | 767 | 562 | 3289.57448055 | -4809.01719055 (-48.09%) | 49.00% |
| LINKUSDT | 15m | Placar clássico | 1.0% | 4753 | 2554 | 332 | 2472.96859775 | -3718.24602775 (-37.18%) | 38.45% |
| LINKUSDT | 15m | Reversão | sem regra | 1287 | - | 483 | 3188.90098668 | -4697.45064668 (-46.97%) | 48.11% |
| LINKUSDT | 15m | Reversão | 0.0% | 1287 | 0 | 483 | 3188.90098668 | -4697.45064668 (-46.97%) | 48.11% |
| LINKUSDT | 15m | Reversão | 0.3% | 1287 | 24 | 479 | 3181.02795709 | -4697.88154709 (-46.98%) | 48.11% |
| LINKUSDT | 15m | Reversão | 0.6% | 1287 | 164 | 424 | 3023.42009878 | -4419.47573878 (-44.19%) | 45.38% |
| LINKUSDT | 15m | Reversão | 1.0% | 1287 | 568 | 260 | 2159.24906802 | -3639.96884802 (-36.40%) | 37.56% |
| LINKUSDT | 1h | Placar clássico | sem regra | 1273 | - | 157 | 1250.34689842 | -1381.34140522 (-13.81%) | 23.85% |
| LINKUSDT | 1h | Placar clássico | 0.0% | 1273 | 0 | 157 | 1250.34689842 | -1381.34140522 (-13.81%) | 23.85% |
| LINKUSDT | 1h | Placar clássico | 0.3% | 1273 | 0 | 157 | 1250.34689842 | -1381.34140522 (-13.81%) | 23.85% |
| LINKUSDT | 1h | Placar clássico | 0.6% | 1273 | 0 | 157 | 1250.34689842 | -1381.34140522 (-13.81%) | 23.85% |
| LINKUSDT | 1h | Placar clássico | 1.0% | 1273 | 19 | 157 | 1250.34689842 | -1381.34140522 (-13.81%) | 23.85% |
| LINKUSDT | 1h | Reversão | sem regra | 325 | - | 122 | 974.64358812 | -1626.44910812 (-16.26%) | 17.46% |
| LINKUSDT | 1h | Reversão | 0.0% | 325 | 0 | 122 | 974.64358812 | -1626.44910812 (-16.26%) | 17.46% |
| LINKUSDT | 1h | Reversão | 0.3% | 325 | 0 | 122 | 974.64358812 | -1626.44910812 (-16.26%) | 17.46% |
| LINKUSDT | 1h | Reversão | 0.6% | 325 | 0 | 122 | 974.64358812 | -1626.44910812 (-16.26%) | 17.46% |
| LINKUSDT | 1h | Reversão | 1.0% | 325 | 0 | 122 | 974.64358812 | -1626.44910812 (-16.26%) | 17.46% |
| BNBUSDT | 15m | Placar clássico | sem regra | 4949 | - | 682 | 6134.27905563 | -8127.84378563 (-81.28%) | 81.55% |
| BNBUSDT | 15m | Placar clássico | 0.0% | 4949 | 65 | 674 | 6091.69699618 | -8115.41531618 (-81.15%) | 81.43% |
| BNBUSDT | 15m | Placar clássico | 0.3% | 4949 | 1695 | 494 | 5171.48111431 | -7287.52182431 (-72.88%) | 73.27% |
| BNBUSDT | 15m | Placar clássico | 0.6% | 4949 | 3524 | 228 | 3034.29403565 | -4677.43144565 (-46.77%) | 48.06% |
| BNBUSDT | 15m | Placar clássico | 1.0% | 4949 | 4574 | 67 | 877.70109615 | -1881.45898615 (-18.81%) | 20.52% |
| BNBUSDT | 15m | Reversão | sem regra | 1370 | - | 540 | 5333.19869285 | -7254.73844285 (-72.55%) | 73.04% |
| BNBUSDT | 15m | Reversão | 0.0% | 1370 | 18 | 532 | 5291.72793335 | -7197.11728335 (-71.97%) | 72.47% |
| BNBUSDT | 15m | Reversão | 0.3% | 1370 | 377 | 396 | 4561.4414368 | -6082.8650768 (-60.83%) | 61.53% |
| BNBUSDT | 15m | Reversão | 0.6% | 1370 | 860 | 193 | 2786.65140667 | -3247.08243667 (-32.47%) | 34.90% |
| BNBUSDT | 15m | Reversão | 1.0% | 1370 | 1228 | 64 | 862.38006602 | -626.94548602 (-6.27%) | 14.77% |
| BNBUSDT | 1h | Placar clássico | sem regra | 1244 | - | 172 | 2288.95512237 | -2381.48489053 (-23.81%) | 24.95% |
| BNBUSDT | 1h | Placar clássico | 0.0% | 1244 | 0 | 172 | 2288.95512237 | -2381.48489053 (-23.81%) | 24.95% |
| BNBUSDT | 1h | Placar clássico | 0.3% | 1244 | 0 | 172 | 2288.95512237 | -2381.48489053 (-23.81%) | 24.95% |
| BNBUSDT | 1h | Placar clássico | 0.6% | 1244 | 86 | 164 | 2170.40317533 | -2309.96520191 (-23.10%) | 24.25% |
| BNBUSDT | 1h | Placar clássico | 1.0% | 1244 | 367 | 135 | 1720.94277126 | -1683.8636408 (-16.84%) | 18.08% |
| BNBUSDT | 1h | Reversão | sem regra | 329 | - | 129 | 1714.07902689 | -1799.98899689 (-18.00%) | 18.00% |
| BNBUSDT | 1h | Reversão | 0.0% | 329 | 0 | 129 | 1714.07902689 | -1799.98899689 (-18.00%) | 18.00% |
| BNBUSDT | 1h | Reversão | 0.3% | 329 | 0 | 129 | 1714.07902689 | -1799.98899689 (-18.00%) | 18.00% |
| BNBUSDT | 1h | Reversão | 0.6% | 329 | 13 | 122 | 1600.83597354 | -1672.32861354 (-16.72%) | 16.72% |
| BNBUSDT | 1h | Reversão | 1.0% | 329 | 66 | 100 | 1230.61268818 | -1457.16176818 (-14.57%) | 15.68% |
| BTCUSDT | 15m | Placar clássico | sem regra | 4805 | - | 676 | 5582.39222112 | -8679.18173782 (-86.79%) | 86.94% |
| BTCUSDT | 15m | Placar clássico | 0.0% | 4805 | 445 | 623 | 5453.2356356 | -8460.625302 (-84.61%) | 84.78% |
| BTCUSDT | 15m | Placar clássico | 0.3% | 4805 | 1898 | 440 | 4544.23336273 | -7422.14043013 (-74.22%) | 74.41% |
| BTCUSDT | 15m | Placar clássico | 0.6% | 4805 | 3486 | 210 | 2812.29714659 | -4594.52626919 (-45.95%) | 46.63% |
| BTCUSDT | 15m | Placar clássico | 1.0% | 4805 | 4418 | 69 | 960.99912774 | -1721.29162364 (-17.21%) | 17.46% |
| BTCUSDT | 15m | Reversão | sem regra | 1399 | - | 549 | 5882.61380693 | -7530.76022413 (-75.31%) | 76.05% |
| BTCUSDT | 15m | Reversão | 0.0% | 1399 | 50 | 518 | 5714.37050021 | -7349.36303541 (-73.49%) | 74.29% |
| BTCUSDT | 15m | Reversão | 0.3% | 1399 | 348 | 391 | 4847.0910849 | -6374.2027117 (-63.74%) | 64.83% |
| BTCUSDT | 15m | Reversão | 0.6% | 1399 | 908 | 178 | 2702.93596457 | -3421.42642427 (-34.21%) | 35.88% |
| BTCUSDT | 15m | Reversão | 1.0% | 1399 | 1264 | 50 | 719.76038419 | -731.48427059 (-7.31%) | 10.23% |
| BTCUSDT | 1h | Placar clássico | sem regra | 1219 | - | 156 | 2159.78354467 | -2587.47727981 (-25.87%) | 27.67% |
| BTCUSDT | 1h | Placar clássico | 0.0% | 1219 | 1 | 155 | 2142.8131814 | -2594.1582247 (-25.94%) | 27.73% |
| BTCUSDT | 1h | Placar clássico | 0.3% | 1219 | 24 | 150 | 2082.48094802 | -2388.27369032 (-23.88%) | 25.73% |
| BTCUSDT | 1h | Placar clássico | 0.6% | 1219 | 206 | 136 | 1828.73174722 | -2336.85222615 (-23.37%) | 25.22% |
| BTCUSDT | 1h | Placar clássico | 1.0% | 1219 | 426 | 102 | 1327.3603269 | -1094.06238348 (-10.94%) | 13.10% |
| BTCUSDT | 1h | Reversão | sem regra | 364 | - | 139 | 1803.05421383 | -2825.11004983 (-28.25%) | 31.42% |
| BTCUSDT | 1h | Reversão | 0.0% | 364 | 0 | 139 | 1803.05421383 | -2825.11004983 (-28.25%) | 31.42% |
| BTCUSDT | 1h | Reversão | 0.3% | 364 | 7 | 136 | 1754.87372709 | -2826.79705699 (-28.27%) | 31.44% |
| BTCUSDT | 1h | Reversão | 0.6% | 364 | 19 | 133 | 1702.50500239 | -2868.94959829 (-28.69%) | 31.84% |
| BTCUSDT | 1h | Reversão | 1.0% | 364 | 86 | 112 | 1392.29020359 | -2371.73906169 (-23.72%) | 26.87% |
| ETHUSDT | 15m | Placar clássico | sem regra | 4849 | - | 650 | 5249.12324699 | -8309.49675139 (-83.09%) | 83.38% |
| ETHUSDT | 15m | Placar clássico | 0.0% | 4849 | 98 | 638 | 5198.58288368 | -8272.01855978 (-82.72%) | 83.01% |
| ETHUSDT | 15m | Placar clássico | 0.3% | 4849 | 946 | 548 | 4760.51862872 | -7839.00434392 (-78.39%) | 78.76% |
| ETHUSDT | 15m | Placar clássico | 0.6% | 4849 | 2380 | 366 | 3599.60288 | -6713.8628017 (-67.14%) | 67.59% |
| ETHUSDT | 15m | Placar clássico | 1.0% | 4849 | 3739 | 170 | 2071.61698506 | -3188.46305676 (-31.88%) | 34.16% |
| ETHUSDT | 15m | Reversão | sem regra | 1407 | - | 541 | 5837.98359695 | -7058.72084365 (-70.59%) | 70.84% |
| ETHUSDT | 15m | Reversão | 0.0% | 1407 | 12 | 534 | 5801.10505085 | -7000.27039675 (-70.00%) | 70.26% |
| ETHUSDT | 15m | Reversão | 0.3% | 1407 | 138 | 476 | 5542.93687282 | -6320.44862722 (-63.20%) | 63.52% |
| ETHUSDT | 15m | Reversão | 0.6% | 1407 | 465 | 350 | 4353.0113884 | -5195.3235577 (-51.95%) | 52.36% |
| ETHUSDT | 15m | Reversão | 1.0% | 1407 | 1010 | 150 | 1935.89285847 | -2113.52185027 (-21.14%) | 23.18% |
| ETHUSDT | 1h | Placar clássico | sem regra | 1243 | - | 173 | 1951.36700111 | -2781.33782365 (-27.81%) | 28.63% |
| ETHUSDT | 1h | Placar clássico | 0.0% | 1243 | 0 | 173 | 1951.36700111 | -2781.33782365 (-27.81%) | 28.63% |
| ETHUSDT | 1h | Placar clássico | 0.3% | 1243 | 7 | 172 | 1938.98516121 | -2741.97157413 (-27.42%) | 28.24% |
| ETHUSDT | 1h | Placar clássico | 0.6% | 1243 | 61 | 170 | 1902.15879213 | -2827.8448349 (-28.28%) | 29.09% |
| ETHUSDT | 1h | Placar clássico | 1.0% | 1243 | 265 | 150 | 1593.04482579 | -2697.60517665 (-26.98%) | 27.80% |
| ETHUSDT | 1h | Reversão | sem regra | 345 | - | 121 | 1308.97726343 | -1675.23705373 (-16.75%) | 19.23% |
| ETHUSDT | 1h | Reversão | 0.0% | 345 | 0 | 121 | 1308.97726343 | -1675.23705373 (-16.75%) | 19.23% |
| ETHUSDT | 1h | Reversão | 0.3% | 345 | 0 | 121 | 1308.97726343 | -1675.23705373 (-16.75%) | 19.23% |
| ETHUSDT | 1h | Reversão | 0.6% | 345 | 2 | 119 | 1269.88597418 | -1753.76628148 (-17.54%) | 20.00% |
| ETHUSDT | 1h | Reversão | 1.0% | 345 | 15 | 113 | 1156.84590169 | -1804.63640739 (-18.05%) | 20.18% |

### Taxas pagas: queda em relação a "sem regra" (15 min)

| Par | Estratégia | 0,3% | 0,6% | 1,0% |
| --- | --- | --- | --- | --- |
| LINKUSDT | Placar clássico | −0,2% | **−4,8%** | −28,4% |
| LINKUSDT | Reversão | −0,2% | **−5,2%** | −32,3% |
| BNBUSDT | Placar clássico | −15,7% | −50,5% | −85,7% |
| BNBUSDT | Reversão | −14,5% | **−47,7%** | −83,8% |
| BTCUSDT | Placar clássico | −18,6% | **−49,6%** | −82,8% |
| BTCUSDT | Reversão | −17,6% | −54,1% | −87,8% |
| ETHUSDT | Placar clássico | −9,3% | **−31,4%** | −60,5% |
| ETHUSDT | Reversão | −5,1% | **−25,4%** | −66,8% |

### Veredito (critérios de parada do `tasks.md`)

- **A 0,6%, as taxas de 15 min NÃO caem ≥ 50% em 6 de 8 combinações** (negrito acima): LINK (−5%, o ATR de LINK em 15 min quase sempre já paga
  0,9%), ETH (−25% a −31%), BNB Reversão (−47,7%) e BTC Placar (−49,6%, por 0,4 ponto). Só BNB Placar e BTC Reversão passam. **PARAR e perguntar
  sobre o padrão D2** (o `tasks.md` T0.2 manda parar se não cair ≥ 50% em algum par).
- **O 1 h piora com a regra** em parte das combinações: ETH Placar a 0,6% (−27,81% → −28,28%), ETH Reversão a 0,6% e 1,0% (−16,75% → −17,54% e
  −18,05%), BTC Reversão a 0,6% (−28,25% → −28,69%; a 0,3% empata, −28,27%). Segunda condição de parada ("se o 1 h piorar") também disparou.
- **Em 1 h a regra quase não age** (LINK 0 a 19 barradas de ~1.270; BNB, BTC e ETH de 0 a 426): o ATR de 1 h já paga o custo; a regra é um filtro de 15 min.
- **Honestidade sobre o resultado: continuou NEGATIVO em todas as 80 linhas**, inclusive a 1,0% (de −6,27% no melhor caso, BNB Reversão 15 min, a
  −37,2% no LINK Placar 15 min). A regra corta taxas e operações mas **não faz o lucro aparecer**: as duas estratégias perdem dinheiro nestes 183 dias com ou sem
  ela; a 15 min elas perdem 47% a 87% do saldo sem a regra. Menos operações significa menos perda, não ganho.
- **Efeito por mínimo (15 min, média das 8 combinações):** 0,3% mexe pouco (LINK nada, BNB/BTC 15% a 19% das taxas); 0,6% é o ponto em que BNB e BTC
  chegam perto de metade das taxas, mas LINK e ETH quase não respondem; 1,0% corta 28% a 88% das taxas e deixa o prejuízo menor em todos os pares
  (−6% a −37%), ao custo de barrar 90% a 92% das compras de 15 min de BNB e BTC.

### Recomendação (para decisão do dono; NÃO aplicada)

Como a 0,6% falha o critério de ≥ 50% em LINK e ETH e o 1 h piora em ETH/BTC Reversão, **o padrão D2 de 0,6% não está comprovado por esta medição**.
Opções para o dono: (a) manter **0,6% como padrão** sabendo que corta ~50% das taxas só em BNB/BTC e quase nada em LINK; (b) padrão **1,0%** (corta mais
em todos os pares e reduz a perda), com o aviso de que barra a maior parte das compras de 15 min de BNB/BTC; (c) padrão **desligado (0)** com o campo
visível e a medição publicada no painel. Recomendação do executor: **1,0% para 15 min** como padrão de pré-preenchimento, porque é o único mínimo que
reduz taxa ≥ 50% em 6 de 8 combinações e melhora o líquido em todos os pares; e **a regra deixa de ser pré-preenchida em 1 h** (efeito nulo ou levemente
negativo). Isso exige decisão do dono (muda o D2); a T3.1 não deve fixar 0,6% antes dela. Fase 1 em diante NÃO foi iniciada.
