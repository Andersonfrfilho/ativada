# Spec 017 — Gráfico em velas menores (3 min) com opiniões de 15 min

## 1. Problema

Em 2026-10-16 o usuário (Anderson, leigo em investimento) pediu, nas palavras dele:

> "apesar de nossas propostas terem 15 minutos, poderíamos ver o gráfico em 3p [3 min] e aí as opiniões ficam de 15 minutos"

Hoje o gráfico da execução (spec 009, `src/runs/candle-chart/`) só oferece as velas que o backfill grava: 15m, 1h, 4h e 1d
(`CANDLE_TIMEFRAMES` em `packages/database/src/candles/candle.constant.ts`, e o `CHECK candles_timeframe_check` no banco
recusa qualquer outra). Numa simulação de 15 min, a menor vela que a pessoa vê é a própria vela de decisão: entre uma
decisão e a próxima ela vê **uma** vela, sem o caminho do preço por dentro.

O pedido é só de **exibição**: as decisões, as opiniões dos agentes (spec 007/011), o placar, a previsão e as simulações
continuam em velas de 15 min. O gráfico passa a poder mostrar velas menores (3 min; 1 e 5 min como opção) com tudo o que
a estratégia fez desenhado **no tempo certo** sobre elas.

## 2. Objetivo

No detalhe de uma execução de 15 min (ao vivo, backtest ou walk-forward), o seletor de vela ganha **3m**. Escolhido:

> **Legenda fixa no topo:** "Gráfico em 3 min · opiniões a cada 15 min"
>
> Cada opinião de 15 min aparece como uma **faixa** que cobre as 5 velas de 3 min em que ela valeu, com o rótulo
> "Opinião das 10:15 · vale até 10:30". Compras e vendas caem na vela de 3 min que contém o instante do preenchimento
> (a abertura da vela de 15 min seguinte à decisão). Alvo e proteção são linhas horizontais. A "Próxima vela de perto"
> continua sobre a vela de **15 min** em formação, agora mostrando as 5 velas de 3 min que a compõem.
>
> **Frase fixa:** "Velas menores mostram mais detalhe do preço, mas não melhoram a previsão nem criam vantagem: a
> estratégia continua decidindo a cada 15 min."

Continua sendo simulação: dinheiro fictício, nenhuma ordem real, nada é recomendação.

## 3. Requisitos funcionais

- **RF01 — Velas de exibição.** Timeframes "só de exibição" (`DISPLAY_ONLY_TIMEFRAMES`, padrão `3m`; `1m` e `5m` por env,
  §9 D2) gravados no banco com retenção curta (D1-A). Nunca são timeframe de execução: `POST /v1/runs` com `3m` = `400`.
- **RF02 — Seletor.** A barra oferece as velas do ambiente (`VITE_MARKET_TIMEFRAMES`) que **dividem** a vela da execução
  e as maiores (como na 009). Velas de exibição só aparecem quando a faixa visível tem dado delas (retenção); fora dela o
  botão fica desabilitado com o texto "Velas de 3 min só existem dos últimos 90 dias".
- **RF03 — Vela padrão.** `live_paper` de 15 min abre em **3m** (pedido do usuário, D3-A); backtest e walk-forward abrem na
  vela da execução. A vela escolhida segue a R6 da 009 (não é lembrada no `localStorage`; acompanha a troca rápida pelo
  `CarriedTimeframeProvider`).
- **RF04 — Opiniões no tempo certo (sem lookahead visual).** Toda camada da estratégia derivada da vela decidida `t`
  (placar, tendência, opinião dos agentes, linhas de preço) é desenhada sobre o intervalo **em que valeu**:
  `[t + d, t + 2d)` (d = 15 min), nunca sobre `[t, t + d)`, porque nesse trecho a decisão ainda não existia. Nas velas
  menores as linhas da estratégia viram degraus que mudam só no fechamento de 15 min.
- **RF05 — Compras e vendas.** Marca na vela de exibição que contém o instante do preenchimento
  (`floor(instante ÷ d_exib) × d_exib`), no preço do preenchimento. Saída por alvo/proteção dentro de uma vela de 15 min
  (o motor não sabe o minuto): marca no início da vela de 15 min com um colchete que cobre as 5 velas de 3 min e a dica
  "Saiu pela proteção entre 10:15 e 10:30 (a simulação decide em velas de 15 min)" (D4-A).
- **RF06 — Níveis.** Alvo e proteção como linhas horizontais do preenchimento de entrada ao de saída (caixas da 009 RF09).
- **RF07 — Previsão.** "Próxima vela de perto" e o cone continuam na vela de 15 min em formação; no modo 3m o painel mostra
  as 5 vagas de 3 min (fechadas, a em formação e as que faltam). O cone no canvas grande cobre as 5 velas de 3 min (fica
  5× mais largo que na 009).
- **RF08 — Vela de 15 min em formação composta.** A legenda mostra "Vela de 15 min em formação (10:15–10:30): A M m F Vol"
  composta das velas de 3 min (fechadas + a em formação) por função pura `composeCandles`; quando a kline de 15 min do
  stream estiver disponível, ela é a fonte (D5-A) e a composição é a reserva.
- **RF09 — Aviso e camadas coerentes.** Em vela maior que a da execução vale o aviso da 009. Em vela menor que divide a da
  execução, todas as camadas aparecem, com a legenda do RF02 da §2. "Esperou" e o placar viram uma barra/degrau por
  intervalo de 15 min.
- **RF10 — Honestidade.** A frase fixa da §2 aparece sempre que a vela da tela for menor que a da execução; o glossário
  ganha "vela de exibição".
- **RF11 — Ao vivo.** Mensagem `candle` do stream com `timeframe: '3m'` (já existe o campo); vela em formação de 3 min
  oca como na 009.

## 4. Requisitos não funcionais

- **RNF01 — Motor intocado.** `packages/strategy-engine`, `packages/run-recording`, `packages/risk-analyst` não mudam.
  O motor, a simulação ao vivo, o backtest, o walk-forward, o analista, as metas e os prazos nunca leem `3m`/`1m`/`5m`.
  **Teste de fronteira**: (a) `RUN_TIMEFRAMES` ∩ `DISPLAY_ONLY_TIMEFRAMES` = ∅; (b) `POST /v1/runs` com cada vela de
  exibição = `400`; (c) sonda que reprova importação de `DISPLAY_ONLY_TIMEFRAMES` em `packages/strategy-engine`,
  `packages/run-recording`, `packages/risk-analyst`, `apps/worker-ativada/src/live`, `apps/api-ativada/src/{backtest,walk-forward,goals,horizons}`;
  (d) todo leitor de velas desses módulos filtra `timeframe = run.timeframe` (mutante: removê-lo faz o teste falhar).
- **RNF02 — Custo.** Retenção padrão 90 dias (`CANDLE_DISPLAY_RETENTION_DAYS`, 7 a 365). Medido no banco dev em
  2026-10-16: `candles` = 838.983 linhas, 151 MB (97 MB tabela + 54 MB índice) ≈ **189 B por linha**. Custos no plan D1.
- **RNF03 — Binance.** Nenhuma chamada externa no caminho do pedido do usuário. Backfill e stream pelo cliente existente
  (`weightCeiling` 6.000, margem 600, 418 aborta).
- **RNF04 — Dinheiro.** Composição OHLCV em `BigInt` escala 8 no painel; `Number` só para desenho (contrato `chart-series`).
- **RNF05 — Desempenho.** 1.000 velas por página, teto de 20.000 na memória (≈ 41,7 dias de 3 min), 60 quadros/s ao
  arrastar 5.000 velas de 3 min (≈ 3,5 dias), medido no E2E.
- **RNF06 — Acessibilidade.** As mesmas da 009 (375 px, contraste, 44 px, ícone + palavra + cor, `aria-live`).

## 5. Decisões tomadas por padrão (o usuário pode mudar — §9)

| # | Decisão | Por quê | Alternativa |
|---|---|---|---|
| D1 | **Gravar `3m` no banco com retenção de 90 dias** (migration aditiva do `CHECK`, backfill, worker grava fechadas, cron de expurgo) | Mesma fonte, mesma validação e mesma recuperação de lacuna das velas de 15 min; nenhuma chamada externa por pedido; ~70 MB | **B:** buscar na Binance sob demanda com cache curto (sem gravar). **C:** gravar `1m` e derivar 3m/5m |
| D2 | Velas de exibição do ambiente: **só `3m`**; `1m` e `5m` ligáveis por env | Atende o pedido com o menor custo | B: `1m`+`3m`+`5m` (≈ 323 MB em 90 dias) |
| D3 | Vela padrão: **3m na `live_paper` de 15 min**; a da execução nos demais | O pedido é sobre o acompanhamento ao vivo | B: sempre a da execução (009 RF05) |
| D4 | Saída por alvo/proteção: **marca no início da vela de 15 min + colchete de 5 velas** | O motor decide na vela de 15 min; achar "a vela de 3 min que tocou" pode contradizer a ordem pessimista do motor (proteção vence alvo) | B: marca na primeira vela de 3 min que tocou o nível |
| D5 | Vela de 15 min em formação: **kline de 15 min** do stream; composição das de 3 min como reserva e para teste | A Binance é a fonte; a composição prova a coerência | B: só composição |
| D6 | Opinião desenhada em `[t + d, t + 2d)` (quando valeu) | Desenhar em `[t, t + d)` mostraria a decisão antes de ela existir | — (invalidada: seria lookahead visual) |

## 6. Fora do escopo

- Decidir, simular, avaliar metas ou medir acerto em vela menor que 15 min (exigiria mudar o motor; spec 007 D5-B).
- Velas de 3 min antes da retenção (histórico de backtests antigos fica em 15 min).
- Faixa visível na URL ao arrastar (pendência R7 da 009, segue pendente).

## 7. Critérios de aceite

1. Simulação ao vivo de 15 min abre em 3m com a legenda e a frase fixa; trocar para 15m mostra o gráfico da 009 idêntico.
2. Oráculo `bigint`: para cada par e cada vela de 15 min dos últimos 90 dias no banco de teste, a composição das 5 velas de
   3 min (abertura da 1ª, máxima, mínima, fechamento da 5ª, soma de volume e de `trade_count`) é **igual** à vela de 15 min
   gravada; divergência é listada (vela, campo) e reprova.
3. Propriedade (2.000 sorteios): nenhuma marca de opinião começa antes de `closedAt` da vela decidida; toda marca de
   preenchimento cai na vela de exibição que contém o instante; mapear para 15m reproduz exatamente as posições da 009.
4. Fronteira do motor (RNF01) verde, com os mutantes mortos.
5. Expurgo apaga só velas de exibição mais velhas que a retenção, em lotes, e nunca 15m/1h/4h/1d (mutante prova).
6. Backfill de 90 dias de 3m nos 9 pares sem 418 no `make backfill-test` (Binance falsa) e com o peso medido no log.
7. 375 px nos dois temas; E2E no Edge com 5.000 velas de 3 min a 60 quadros/s; uma captura final em `evidence.md`.

## 8. Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| Leigo acha que vela menor = previsão melhor | Opera mais | Frase fixa RF10; nada muda no placar nem no acerto |
| Opinião desenhada no trecho errado | Parece que a estratégia "adivinhou" | D6 + propriedade do aceite 3 |
| 418 da Binance no backfill grande | Para worker e cron do mesmo IP | Retenção 90 dias (396 pedidos); portão de peso existente; 418 aborta; backfill grande só com autorização |
| Banco cresce | Disco | Expurgo diário; ~0,8 MB/dia de 3m nos 9 pares, estável em ~70 MB |
| Stream com mais assinaturas | Carga no worker/API | 9 streams a mais por conexão (limite da Binance: 1.024); agregador 1/s por par e vela |
| Divergência 3m × 15m da Binance | Legenda e vela de 15 min discordam | Oráculo do aceite 2; a kline de 15 min é a fonte (D5) |

## 9. Decisões que o usuário precisa tomar (A = recomendado)

1. **Onde moram as velas de 3 min (D1):** **A)** gravar no banco, só os últimos 90 dias (~70 MB, backfill de ~396 pedidos,
   migration aditiva e cron de expurgo — exige sua autorização) · B) buscar na Binance a cada pedido, com cache de 60 s
   (sem migration, mas cada arrasto de cada pessoa vira chamada externa no mesmo IP do worker; um 418 pararia a simulação
   ao vivo) · C) gravar velas de 1 min e montar 3 e 5 min (~211 MB em 90 dias, 5× as linhas).
2. **Quais velas menores (D2):** **A)** só 3 min · B) 1, 3 e 5 min (~323 MB em 90 dias).
3. **Retenção:** **A)** 90 dias · B) 30 dias (~23 MB) · C) 2 anos (~600 MB, 3.159 pedidos de backfill).
4. **Vela ao abrir (D3):** **A)** 3 min na simulação ao vivo de 15 min · B) sempre a vela da execução.
5. **Saída por alvo/proteção (D4):** **A)** marca no início da vela de 15 min com colchete · B) na primeira vela de 3 min
   que tocou o nível (aproximado; pode contradizer o motor).
