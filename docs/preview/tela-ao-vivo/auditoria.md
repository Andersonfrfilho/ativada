# Auditoria da tela de simulação ao vivo (2026-10-19)

Legenda: [V] verificado no código · [I] inferido. Caminhos relativos a `apps/frontend-ativada/src/` salvo indicação.

## Os 10 problemas mais sérios

1. **[V] ALTA — "Equipe agora" tampa o gráfico.** `runs/team-room/balcony/Balcony.module.css:2-5` (`sticky; top: 40px; z-index: 15`, sem `max-height`), primeiro filho do `<figure>` (`runs/candle-chart/CandleCanvas.component.tsx:31`). No celular a lousa vira `position: fixed; bottom: 0` e cobre o rodapé; a densidade só olha a altura (`balcony-density.ts:16-19`). Correção pequena: tirar o sticky ou limitar a ~25vh; média: densidade também pela largura e lousa por botão.
2. **[V] ALTA — a plaquinha da "última saída" mostra a PRIMEIRA operação fechada.** `TradePlaques.component.tsx:43` pega `items[0]`, mas a API ordena crescente (`packages/database/src/run-results/run-position-list.ts:54`). Correção: `order=desc` na rota ou a última saída no `live-status`.
3. **[V/I] ALTA para PEPE — P&L líquido recalculado no cliente com 8 casas.** `format/decimal.ts:4,21`, `protection-math.ts:52-58`. Em moeda de ~0,00001 o erro chega a ~0,1 % por perna e pode trocar ganho/perda perto do zero. Correção média: o servidor devolve o líquido projetado, ou escala 18 no cliente.
4. **[V] ALTA — detalhe consultado a cada 2 s para sempre.** `runs/runs.query.ts:62-63` + `run.validation.ts:141-142`; teto de 120/min (`api-ativada/src/router/authenticate-route-request.ts:87`). 4 abas dão 429. Correção pequena: 30-60 s ou desligado em `live_paper` rodando (o WebSocket já invalida).
5. **[V] MÉDIA-ALTA — invalidação larga demais.** `live/useLiveStream.hook.ts:17-19,34` ignora `runId`; a lista de trades refaz todas as páginas (`runs.query.ts:124-144`); `onResync` invalida tudo; cinco rotas no mesmo balde de 60/min. Correção média: invalidar por `runId`, trades só a primeira página.
6. **[V/I] MÉDIA — "comprar e segurar" com tendência contraditória** entre `LiveSummaryStrip.component.tsx:62-63` (porcentagem a 0,01 %) e `LiveBalanceBlock.component.tsx:91-95` (centavos). Correção pequena: regra única.
7. **[V] MÉDIA — seções e avisos duplicados.** Equipe duas vezes (varanda e sala), saldo e resultado duas vezes, meta duas vezes, estado da simulação em três lugares, ≥ 7 avisos de "fictício". Correção média: o redesign deste preview.
8. **[V] MÉDIA — "Cancelar simulação" sem confirmação** (`runs/RunProgressCard.component.tsx:43-51`). Correção pequena: diálogo.
9. **[V] BAIXA-MÉDIA — botão "Expandir" recolhe em janela baixa** (`useBalconyDensity.hook.ts`, `balcony-density.ts:17`). Correção pequena.
10. **[V] MÉDIA — plaquinhas com cara de boleta** ("COMPRA", "VENDA" sem "simulada", `plaque-model.ts:87,112,121`); "desde 14:00" sem data em posição de dias (`format/zoned-time.ts:85-86`); índice de seções sem `scroll-margin` nem foco (`LiveSectionIndex.component.tsx:20-22`). Correção pequena.

## O que está correto

- Arredondamento dirigido do dinheiro igual ao servidor (`directed-money.ts`), zero sem sinal.
- Rajada de avisos com espera de 500 ms; páginas antigas de decisões e previsões não são refeitas.
- Parada e espera por dado emitem `pg_notify`.
- Anúncio de vela nova sem duplicar no leitor de tela; animação respeita `prefers-reduced-motion`; teste de contraste existe.
- Preço da PEPE não aparece como "0,00".

## Ordem recomendada

1. #1, #2 e #8 (pequenas, impacto imediato).
2. #4 e #5 (acabam com os 429).
3. #3 e #6 (números).
4. #9 e #10.
5. #7, a reorganização, depois dos números certos.
